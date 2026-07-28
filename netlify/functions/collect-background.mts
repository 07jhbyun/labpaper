import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ── 설정 ────────────────────────────────────────────────────────────────────

const CROSSREF_API = 'https://api.crossref.org/works'
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1'

const JOURNAL_ISSN_MAP: Record<string, string> = {
  'Nature': '0028-0836', 'Science': '0036-8075',
  'Nature Nanotechnology': '1748-3387', 'Nature Energy': '2058-7546',
  'Nature Chemistry': '1755-4330', 'Nature Catalysis': '2520-1158',
  'Nature Water': '2731-6084', 'Nature Sustainability': '2398-9629',
  'Nature Communications': '2041-1723', 'Joule': '2542-4351',
  'Matter': '2590-2385', 'Chem': '2451-9294',
  'Science Advances': '2375-2548', 'Advanced Materials': '1521-4095',
  'Advanced Functional Materials': '1616-3028', 'ACS Energy Letters': '2380-8195',
  'ACS Nano': '1936-0851', 'Nano Letters': '1530-6984',
  'Nano Energy': '2211-2855', 'Energy & Environmental Science': '1754-5706',
  'Angewandte Chemie International Edition': '1521-3773',
  'Journal of the American Chemical Society': '0002-7863',
  'Chemical Science': '2041-6520', 'ACS Catalysis': '2155-5435',
  'ACS Applied Materials & Interfaces': '1944-8244',
  'Chemical Engineering Journal': '1385-8947', 'Small': '1613-6829',
  'Journal of Membrane Science': '0376-7388', 'Water Research': '0043-1354',
  'Applied Catalysis B Environmental': '0926-3373',
  'Environmental Science & Technology': '0013-936X',
  'ChemCatChem': '1867-3880', 'Chemistry of Materials': '0897-4756',
  'Green Chemistry': '1463-9262', 'ChemSusChem': '1864-5631',
  'Cell Reports Physical Science': '2666-3864',
}

const JOURNAL_IF_MAP: Record<string, number> = {
  'Nature': 70, 'Science': 68, 'Nature Nanotechnology': 40, 'Nature Energy': 60,
  'Nature Chemistry': 30, 'Nature Catalysis': 38, 'Nature Water': 25,
  'Nature Sustainability': 30, 'Nature Communications': 17, 'Joule': 46,
  'Matter': 20, 'Chem': 23, 'Science Advances': 13, 'Advanced Materials': 29,
  'Advanced Functional Materials': 19, 'ACS Energy Letters': 16, 'ACS Nano': 17,
  'Nano Letters': 10, 'Nano Energy': 17, 'Energy & Environmental Science': 32,
  'Angewandte Chemie International Edition': 16,
  'Journal of the American Chemical Society': 15, 'Chemical Science': 8,
  'ACS Catalysis': 12, 'ACS Applied Materials & Interfaces': 9,
  'Chemical Engineering Journal': 15, 'Small': 13, 'Journal of Membrane Science': 9,
  'Water Research': 11, 'Applied Catalysis B Environmental': 22,
  'Environmental Science & Technology': 11, 'ChemCatChem': 4,
  'Chemistry of Materials': 8, 'Green Chemistry': 9, 'ChemSusChem': 8,
  'Cell Reports Physical Science': 8,
}

const KEYWORDS = [
  'porous polymer', 'conjugated polymer', 'photocatal', 'electrocatal',
  'water treatment', 'water purification', 'membrane', 'covalent organic',
  'COF', 'H2O2', 'MOF', 'metal-organic framework', 'metal organic framework',
  'covalent triazine', 'CTF', 'hydrogen peroxide', 'photo-Fenton',
  'deionization', 'deep eutectic solvent', 'lithium battery recycling',
  'contact electrification', 'heterogeneous catalysis', 'radical photocatalysis',
  'organic semiconductor', 'bandgap', 'band gap', 'visible light',
  'nitrate reduction',
]
const REVIEW_TITLE_KW = ['review', 'perspective', 'progress', 'outlook', 'highlight']
const REVIEW_ABSTRACT_KW = ['this review', 'in this review', 'we review']

// ── 유틸 ────────────────────────────────────────────────────────────────────

let _startTime = 0
function elapsed() {
  return `+${Math.round((Date.now() - _startTime) / 1000)}s`
}

// 저널별 수집 결과 집계 — 실패(429/timeout)와 "정말 0편"을 구분하기 위해 기록한다.
type JournalStat = {
  name: string
  fetched: number
  total: number
  outcome: 'ok' | 'timeout' | 'http-error' | 'exception'
  detail?: string
}
let _journalStats: JournalStat[] = []

// Promise에 timeout을 걸어 초과 시 null/기본값을 반환 (throw 하지 않음)
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}

function getMatchedKeywords(title: string, abstract: string, extraKeywords: string[] = []): string[] {
  const text = `${title} ${abstract}`.toLowerCase()
  const all = [...new Set([...KEYWORDS, ...extraKeywords])]
  return all.filter(kw => text.includes(kw.toLowerCase()))
}

function isReviewPaper(title: string, abstract: string) {
  const t = title.toLowerCase()
  if (REVIEW_TITLE_KW.some(kw => t.includes(kw))) return true
  const a = abstract.toLowerCase()
  return REVIEW_ABSTRACT_KW.some(ph => a.includes(ph))
}

function normalizeTitle(title: string) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

function serializeError(e: unknown): string {
  if (e instanceof Error) return `${e.message}\n${e.stack ?? ''}`
  if (typeof e === 'string') return e
  try { return JSON.stringify(e) } catch { return String(e) }
}

// ── 논문 수집 ────────────────────────────────────────────────────────────────

async function fetchByJournal(journalName: string, issn: string) {
  try {
    const from = new Date()
    from.setDate(from.getDate() - 14)
    const fromStr = from.toISOString().split('T')[0]
    const url = `${CROSSREF_API}?filter=issn:${issn},from-pub-date:${fromStr}&sort=published&order=desc&rows=100&select=title,author,published,DOI,abstract,container-title`
    const res = await withTimeout(
      fetch(url, { headers: { 'User-Agent': 'LabPaper/1.0 (mailto:07jhbyun@gmail.com)' } }),
      10_000,
      null
    )
    if (!res) {
      console.warn(`[collect-bg] fetchByJournal TIMEOUT: ${journalName}`)
      _journalStats.push({ name: journalName, fetched: 0, total: 0, outcome: 'timeout' })
      return []
    }
    if (!res.ok) {
      console.warn(`[collect-bg] ❌ Crossref HTTP ${res.status}: ${journalName}`)
      _journalStats.push({ name: journalName, fetched: 0, total: 0, outcome: 'http-error', detail: String(res.status) })
      return []
    }
    const data = await res.json()
    const items = data.message?.items || []
    // total: Crossref가 보유한 전체 건수. items.length가 rows 상한(10)에 걸리면
    // total과의 격차가 그대로 "못 본 논문 수"다.
    const total = data.message?.['total-results'] ?? 0
    const truncated = total > items.length ? ` ⚠truncated(${total - items.length}편 미조회)` : ''
    console.log(`[collect-bg]   journal "${journalName}" → ${items.length}편 / total=${total}${truncated}`)
    _journalStats.push({ name: journalName, fetched: items.length, total, outcome: 'ok' })
    return items.map((item: any) => ({
      title: stripHtml(Array.isArray(item.title) ? item.title[0] : item.title || ''),
      authors: item.author?.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).join(', ') || '',
      journal: journalName,
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      doi: item.DOI,
      abstract: stripHtml(item.abstract || ''),
      source: 'auto',
    }))
  } catch (e) {
    console.warn(`[collect-bg] fetchByJournal ERROR "${journalName}": ${serializeError(e)}`)
    _journalStats.push({ name: journalName, fetched: 0, total: 0, outcome: 'exception', detail: serializeError(e).slice(0, 120) })
    return []
  }
}

async function fetchByAuthor(authorName: string) {
  try {
    const searchRes = await withTimeout(
      fetch(
        `${SEMANTIC_SCHOLAR_API}/author/search?query=${encodeURIComponent(authorName)}&fields=authorId,name`,
        { headers: { 'User-Agent': 'LabPaper/1.0' } }
      ),
      8_000,
      null
    )
    if (!searchRes) {
      console.warn(`[collect-bg] fetchByAuthor TIMEOUT (search): ${authorName}`)
      return []
    }
    if (!searchRes.ok) {
      const body = await searchRes.text().catch(() => '')
      console.warn(`[collect-bg] ❌ S2 author/search HTTP ${searchRes.status} "${authorName}": ${body.slice(0, 200)}`)
      return []
    }
    const data = await searchRes.json()
    if (!data.data?.length) {
      console.warn(`[collect-bg]   author "${authorName}" → S2 검색 결과 없음 (이름 표기 불일치 의심)`)
      return []
    }
    const authorId = data.data[0].authorId

    const papersRes = await withTimeout(
      fetch(
        // tldr는 이 엔드포인트에서 지원되지 않음 (요청 시 HTTP 400) — 넣지 말 것
        `${SEMANTIC_SCHOLAR_API}/author/${authorId}/papers?fields=title,authors,year,journal,externalIds,abstract&limit=5&sort=publicationDate`,
        { headers: { 'User-Agent': 'LabPaper/1.0' } }
      ),
      8_000,
      null
    )
    if (!papersRes) {
      console.warn(`[collect-bg] fetchByAuthor TIMEOUT (papers): ${authorName}`)
      return []
    }
    if (!papersRes.ok) {
      const body = await papersRes.text().catch(() => '')
      console.warn(`[collect-bg] ❌ S2 author/${authorId}/papers HTTP ${papersRes.status} "${authorName}": ${body.slice(0, 200)}`)
      return []
    }
    const papersData = await papersRes.json()
    const fetched = papersData.data || []
    // 작년치까지 허용 — 올해만 보면 연초에 저자 논문이 전부 걸러진다
    const minYear = new Date().getFullYear() - 1
    const yearPassed = fetched.filter((p: any) => p.year >= minYear)
    console.log(
      `[collect-bg]   author "${authorName}" (S2 id=${authorId}, matched="${data.data[0].name}") → ` +
      `${fetched.length}편 조회 → ${yearPassed.length}편 (year>=${minYear})` +
      (fetched.length > 0 && yearPassed.length === 0 ? ` ⚠연도필터로 전멸` : '')
    )
    return yearPassed
      .map((p: any) => ({
        title: stripHtml(p.title || ''),
        authors: p.authors?.map((a: any) => a.name).join(', ') || authorName,
        journal: p.journal?.name || 'Unknown',
        year: p.year,
        doi: p.externalIds?.DOI,
        abstract: stripHtml(p.abstract || ''),
        source: 'auto',
      }))
  } catch (e) {
    console.warn(`[collect-bg] fetchByAuthor ERROR "${authorName}": ${serializeError(e)}`)
    return []
  }
}

// ── abstract / 이미지 / 소속 ────────────────────────────────────────────────

async function fetchAbstract(doi: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`${SEMANTIC_SCHOLAR_API}/paper/DOI:${doi}?fields=abstract`,
        { headers: { 'User-Agent': 'LabPaper/1.0' } }),
      6_000, null
    )
    if (res?.ok) {
      const data = await res.json()
      if (data.abstract) return stripHtml(data.abstract as string)
    }
  } catch {}

  try {
    const res = await withTimeout(
      fetch(`https://api.crossref.org/works/${doi}`,
        { headers: { 'User-Agent': 'LabPaper/1.0 (mailto:07jhbyun@gmail.com)' } }),
      6_000, null
    )
    if (res?.ok) {
      const data = await res.json()
      const abstract = (data.message?.abstract as string | undefined)?.replace(/<[^>]*>/g, '').trim()
      if (abstract) return abstract
    }
  } catch {}

  try {
    const res = await withTimeout(
      fetch(`https://api.openalex.org/works/https://doi.org/${doi}`,
        { headers: { 'User-Agent': 'LabPaper/1.0 (mailto:07jhbyun@gmail.com)' } }),
      6_000, null
    )
    if (res?.ok) {
      const data = await res.json()
      const inv = data.abstract_inverted_index as Record<string, number[]> | null
      if (inv && typeof inv === 'object') {
        const pairs: [number, string][] = []
        for (const [word, positions] of Object.entries(inv))
          for (const pos of positions) pairs.push([pos, word])
        pairs.sort(([a], [b]) => a - b)
        const abstract = pairs.map(([, w]) => w).join(' ')
        if (abstract) return abstract
      }
    }
  } catch {}

  return null
}

async function fetchTocImage(doi: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=figures`,
        { headers: { 'User-Agent': 'LabPaper/1.0' } }),
      4_000, null
    )
    if (res?.ok) {
      const data = await res.json()
      const url = data.figures?.[0]?.imageUrls?.[0]
      if (url) return url
    }
  } catch {}

  try {
    const res = await withTimeout(
      fetch(`https://doi.org/${doi}`, { headers: { 'User-Agent': 'LabPaper/1.0' } }),
      4_000, null
    )
    if (res) {
      const html = await res.text()
      const match =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      return match?.[1] || null
    }
  } catch {}

  return null
}

async function fetchAffiliations(doi: string) {
  try {
    const res = await withTimeout(
      fetch(`${SEMANTIC_SCHOLAR_API}/paper/DOI:${doi}?fields=authors.affiliations,authors.name`,
        { headers: { 'User-Agent': 'LabPaper/1.0' } }),
      6_000, null
    )
    if (!res?.ok) return {}
    const data = await res.json()
    const authors: { name: string; affiliations: string[] }[] = data.authors || []
    if (!authors.length) return {}
    const pick = (a: { name: string; affiliations: string[] }) => ({
      name: a.name,
      affiliation: a.affiliations?.[0] || '',
    })
    const first = pick(authors[0])
    const last = pick(authors[authors.length - 1])
    const result: Record<string, { name: string; affiliation: string }> = {}
    if (first.affiliation) result.first = first
    if (authors.length > 1 && last.affiliation) result.corresponding = last
    return result
  } catch {
    return {}
  }
}

// ── AI (5개씩 배치 처리 — rate limit 방지) ──────────────────────────────────

const AI_MODEL = 'claude-sonnet-4-6'

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e: any) {
    if (e?.status === 429 || e?.message?.includes('rate')) {
      console.warn(`[collect-bg] rate limit hit, retrying in 3s...`)
      await new Promise(r => setTimeout(r, 3000))
      return fn()
    }
    throw e
  }
}

async function batchRun<T>(items: any[], fn: (item: any) => Promise<T>, batchSize = 5): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, 1000))
  }
  return results
}

async function generateTitleKo(client: Anthropic, title: string): Promise<string> {
  try {
    const msg = await withTimeout(
      callWithRetry(() => client.messages.create({
        model: AI_MODEL,
        max_tokens: 100,
        messages: [{ role: 'user', content: `다음 논문 제목을 한국어로 자연스럽게 번역해줘. 번역문만 답해줘.\n${title}` }],
      })),
      30_000, null
    )
    return msg?.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

async function generateBullets(client: Anthropic, title: string, abstract: string, journal: string) {
  try {
    const msg = await withTimeout(
      callWithRetry(() => client.messages.create({
        model: AI_MODEL,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `다음 논문의 핵심 결과를 한국어 bullet 3개로 요약해줘. 수치/결과 포함, 1-2문장씩.
JSON 배열만: ["bullet1","bullet2","bullet3"]
제목: ${title}\n저널: ${journal}\n초록: ${abstract.slice(0, 800)}`,
        }],
      })),
      30_000, null
    )
    if (!msg) return ['원문 링크에서 확인해주세요.', '', '']
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const bullets = JSON.parse(text.replace(/```json|```/g, '').trim())
    return Array.isArray(bullets) ? bullets.slice(0, 3) : []
  } catch {
    return ['원문 링크에서 확인해주세요.', '', '']
  }
}

async function generateHoroscope(client: Anthropic, issueNumber: number, titles: string[], abstracts: string[]) {
  try {
    const context = titles.slice(0, 5).map((t, i) =>
      `${i + 1}. ${t}${abstracts[i] ? ` — ${abstracts[i].slice(0, 150)}` : ''}`
    ).join('\n')
    const msg = await withTimeout(
      callWithRetry(() => client.messages.create({
        model: AI_MODEL,
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `너는 연구실 막내 대학원생. 이번 주 논문을 밈 감성으로 요약해줘. 한국어.
이번 주 논문:\n${context}\n
JSON만 답해줘:
{"paper_luck":"전체 분위기 한 줄 밈","experiment_luck":"황당한 실험/결과 개그","citation_luck":"대학원생 공감 포인트","reviewer_luck":"논문 한 줄 평"}`,
        }],
      })),
      45_000, null
    )
    if (!msg) throw new Error('horoscope timeout')
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return {
      paper_luck: '이번 주 테마: 빛으로 모든 걸 해결하려는 사람들.',
      experiment_luck: 'H₂O₂를 빛으로 만들었다고 함. 그냥 사면 안 되나요.',
      citation_luck: '이번 주도 내 논문은 아무도 안 읽었겠지.',
      reviewer_luck: '"Reviewer 1: very interesting work" — 이 말이 제일 무섭다.',
    }
  }
}

// ── 메인 ────────────────────────────────────────────────────────────────────

export default async (req: Request) => {
  _startTime = Date.now()
  _journalStats = [] // 워밍된 컨테이너 재사용 시 이전 실행 집계가 남지 않도록 초기화
  console.log(`[collect-bg] ▶ START ${new Date().toISOString()}`)

  // 환경변수 존재 여부 확인
  const envCheck = {
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SERVICE_ROLE_KEY: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_KEY: !!process.env.ANTHROPIC_API_KEY,
    CRON_SECRET: !!(process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET),
  }
  console.log(`[collect-bg] env=${JSON.stringify(envCheck)}`)

  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET
  // auth === null → Netlify Scheduled Function 자동 호출 (Authorization 헤더 없음) → 허용
  // auth가 있으나 토큰이 틀림 → 외부 비인가 요청 → 거부
  if (auth !== null && auth !== `Bearer ${cronSecret}`) {
    console.error(`[collect-bg] ❌ Unauthorized. received="${auth?.slice(0, 20)}..." expected="Bearer ***"`)
    return
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)!
  )
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let step = 'init'
  try {
    // ── 1. 이슈 번호 ────────────────────────────────────────────
    step = 'fetch-issue-number'
    const { data: lastIssue, error: issueQueryError } = await supabase
      .from('issues').select('issue_number')
      .order('issue_number', { ascending: false }).limit(1).single()
    if (issueQueryError && issueQueryError.code !== 'PGRST116') {
      throw new Error(`issues 조회 실패: ${issueQueryError.message}`)
    }
    const newIssueNumber = (lastIssue?.issue_number || 0) + 1
    console.log(`[collect-bg] ${elapsed()} issueNumber=${newIssueNumber}`)

    // ── 1b. 이번 주 중복 수집 방지 ─────────────────────────────
    // 이번 주 월요일(UTC) 이후 이미 발행된 이슈가 있으면 스킵
    step = 'check-this-week'
    {
      const now = new Date()
      const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const monday = new Date(now)
      monday.setUTCDate(now.getUTCDate() - daysSinceMonday)
      monday.setUTCHours(0, 0, 0, 0)
      const mondayStr = monday.toISOString().split('T')[0] // 'YYYY-MM-DD'

      const { data: thisWeekIssue } = await supabase
        .from('issues')
        .select('issue_number, published_at')
        .gte('published_at', mondayStr)
        .limit(1)
        .maybeSingle()

      if (thisWeekIssue) {
        console.log(`[collect-bg] ${elapsed()} ⏭ 이번 주 이미 수집됨 Vol.${thisWeekIssue.issue_number} (${thisWeekIssue.published_at}) — 스킵`)
        return
      }
      console.log(`[collect-bg] ${elapsed()} 이번 주 미수집 확인 (기준: ${mondayStr}) — 수집 진행`)
    }

    // ── 2. 기존 논문 + 저자 목록 병렬 조회 ──────────────────────
    step = 'fetch-meta'
    const [{ data: authors, error: authorsErr }, { data: existingPapers }, { data: noAbstractPapers }] = await Promise.all([
      supabase.from('followed_authors').select('name').in('status', ['active', 'auto_added']),
      supabase.from('papers').select('doi, title'),
      supabase.from('papers').select('id, doi').is('abstract', null).not('doi', 'is', null).limit(25),
    ])
    if (authorsErr) console.warn(`[collect-bg] followed_authors query error: ${authorsErr.message}`)
    const existingDois = new Set<string>((existingPapers || []).map(p => p.doi).filter(Boolean))
    const existingTitles = new Set<string>((existingPapers || []).map(p => normalizeTitle(p.title)))
    console.log(`[collect-bg] ${elapsed()} authors=${authors?.length ?? 0} existingDois=${existingDois.size} noAbstract=${noAbstractPapers?.length ?? 0}`)

    const backfillPromise = noAbstractPapers?.length
      ? Promise.all(noAbstractPapers.map(async (p: any) => {
          const abstract = await fetchAbstract(p.doi)
          if (abstract) await supabase.from('papers').update({ abstract }).eq('id', p.id)
        })).then(() => console.log(`[collect-bg] ${elapsed()} backfill done (up to ${noAbstractPapers.length})`))
      : Promise.resolve()

    // ── 3. 저자 + 저널 수집 ──────────────────────────────────────
    step = 'collect-papers'
    console.log(`[collect-bg] ${elapsed()} collecting authors...`)

    const authorList = authors || []
    const authorBatches: typeof authorList[] = []
    for (let i = 0; i < authorList.length; i += 5) authorBatches.push(authorList.slice(i, i + 5))
    const authorResults: any[][] = []
    for (const batch of authorBatches) {
      const res = await Promise.all(batch.map(a => fetchByAuthor(a.name)))
      authorResults.push(...res)
      if (authorBatches.indexOf(batch) < authorBatches.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    const authorPaperCount = authorResults.flat().length
    const authorsWithZero = authorResults.filter(r => r.length === 0).length
    console.log(
      `[collect-bg] ${elapsed()} authors done → ${authorPaperCount}편 ` +
      `(저자 ${authorList.length}명 중 ${authorsWithZero}명이 0편)`
    )
    if (authorList.length > 0 && authorPaperCount === 0) {
      console.warn(`[collect-bg] ⚠ 저자 수집 전멸 — 저자 ${authorList.length}명 전원 0편. S2 API 에러/연도필터 로그 확인 필요`)
    }

    console.log(`[collect-bg] ${elapsed()} collecting journals (${Object.keys(JOURNAL_ISSN_MAP).length}개)...`)
    const journalEntries = Object.entries(JOURNAL_ISSN_MAP)
    const journalBatches: typeof journalEntries[] = []
    // Crossref rate limit 회피: 동시 3개 + 배치 간 1.5초 (8개/0.5초는 429 유발)
    for (let i = 0; i < journalEntries.length; i += 3) journalBatches.push(journalEntries.slice(i, i + 3))
    const journalResults: any[][] = []
    for (const batch of journalBatches) {
      const res = await Promise.all(batch.map(([name, issn]) => fetchByJournal(name, issn)))
      journalResults.push(...res)
      if (journalBatches.indexOf(batch) < journalBatches.length - 1) await new Promise(r => setTimeout(r, 1500))
    }
    const journalPaperCount = journalResults.flat().length
    console.log(`[collect-bg] ${elapsed()} journals done → ${journalPaperCount}편`)

    // 저널 수집 요약: 실패한 저널과 rows 상한에 잘린 저널을 명시적으로 드러낸다.
    {
      const failed = _journalStats.filter(s => s.outcome !== 'ok')
      const truncated = _journalStats.filter(s => s.outcome === 'ok' && s.total > s.fetched)
      const missedTotal = truncated.reduce((sum, s) => sum + (s.total - s.fetched), 0)
      console.log(
        `[collect-bg] ${elapsed()} 저널 요약: ${_journalStats.length}개 시도 / ` +
        `성공 ${_journalStats.length - failed.length} / 실패 ${failed.length} / rows상한에 잘린 저널 ${truncated.length}`
      )
      if (failed.length > 0) {
        const byOutcome: Record<string, string[]> = {}
        for (const s of failed) {
          const key = s.detail ? `${s.outcome}(${s.detail})` : s.outcome
          ;(byOutcome[key] ||= []).push(s.name)
        }
        for (const [key, names] of Object.entries(byOutcome)) {
          console.warn(`[collect-bg] ⚠ 저널 수집 실패 [${key}] ${names.length}개: ${names.join(', ')}`)
        }
      }
      if (missedTotal > 0) {
        console.warn(
          `[collect-bg] ⚠ rows 상한으로 총 ${missedTotal}편 미조회. ` +
          `상위 5개: ${truncated.sort((a, b) => (b.total - b.fetched) - (a.total - a.fetched)).slice(0, 5)
            .map(s => `${s.name}(${s.fetched}/${s.total})`).join(', ')}`
        )
      }
    }

    const allRawPapers = [...authorResults.flat(), ...journalResults.flat()]
    console.log(`[collect-bg] ${elapsed()} raw=${allRawPapers.length} (저자 ${authorPaperCount} + 저널 ${journalPaperCount})`)

    // ── 4. 중복 제거 ─────────────────────────────────────────────
    step = 'deduplicate'
    const seenDois = new Set<string>()
    const seenTitles = new Set<string>()
    const uniquePapers = allRawPapers.filter(p => {
      const normTitle = normalizeTitle(p.title || '')
      if (seenTitles.has(normTitle) || existingTitles.has(normTitle)) return false
      if (p.doi && (seenDois.has(p.doi) || existingDois.has(p.doi))) return false
      seenTitles.add(normTitle)
      if (p.doi) seenDois.add(p.doi)
      return true
    })
    console.log(`[collect-bg] ${elapsed()} unique=${uniquePapers.length} (dedup: ${allRawPapers.length - uniquePapers.length} 제거)`)

    // ── 4.5. 신규 논문 abstract 보완 ────────────────────────────
    step = 'fill-abstracts'
    // rows=100 이후 abstract 없는 논문이 수백 건이 된다. 전체를 Promise.all로 한 번에
    // 던지면 S2/Crossref/OpenAlex 3곳에 수천 건이 동시에 나가 rate limit에 걸린다.
    // → IF 높은 저널(어차피 selectedPapers로 뽑힐 후보) 우선, 상한 + 동시 8건으로 제한.
    const ABSTRACT_FILL_LIMIT = 300
    const ABSTRACT_FILL_CONCURRENCY = 8
    const missingAll = uniquePapers
      .filter((p: any) => !p.abstract && p.doi)
      .sort((a: any, b: any) => (JOURNAL_IF_MAP[b.journal] || 0) - (JOURNAL_IF_MAP[a.journal] || 0))
    const missingAbstractPapers = missingAll.slice(0, ABSTRACT_FILL_LIMIT)
    if (missingAll.length > ABSTRACT_FILL_LIMIT) {
      console.warn(
        `[collect-bg] ⚠ abstract 보완 상한 적용: ${missingAll.length}편 중 상위 ${ABSTRACT_FILL_LIMIT}편만 조회 ` +
        `(${missingAll.length - ABSTRACT_FILL_LIMIT}편은 abstract 없이 키워드 필터 통과 — 제목으로만 매칭됨)`
      )
    }
    if (missingAbstractPapers.length > 0) {
      const filled: (string | null)[] = []
      for (let i = 0; i < missingAbstractPapers.length; i += ABSTRACT_FILL_CONCURRENCY) {
        const chunk = missingAbstractPapers.slice(i, i + ABSTRACT_FILL_CONCURRENCY)
        filled.push(...await Promise.all(chunk.map((p: any) => fetchAbstract(p.doi))))
      }
      missingAbstractPapers.forEach((p: any, i: number) => { if (filled[i]) p.abstract = filled[i] })
      console.log(`[collect-bg] ${elapsed()} abstract fill: ${filled.filter(Boolean).length}/${missingAbstractPapers.length}`)
    }

    // ── 5. 키워드/리뷰 필터 ──────────────────────────────────────
    step = 'filter-papers'
    const { data: dbKeywords } = await supabase.from('keywords').select('keyword')
    const extraKeywords = (dbKeywords || []).map((k: any) => k.keyword)

    const keywordPassed = uniquePapers.filter(p =>
      getMatchedKeywords(p.title || '', p.abstract || '', extraKeywords).length > 0
    )
    const reviewFiltered = keywordPassed.filter(p => !isReviewPaper(p.title || '', p.abstract || ''))
    const selectedPapers = reviewFiltered
      .sort((a, b) => (JOURNAL_IF_MAP[b.journal] || 0) - (JOURNAL_IF_MAP[a.journal] || 0))
      .slice(0, 15)

    // 단계별 유실량을 한 줄로 — 어느 필터가 논문을 잡아먹었는지 바로 보이게
    console.log(
      `[collect-bg] ${elapsed()} 📊 FUNNEL: ` +
      `raw=${allRawPapers.length} → unique=${uniquePapers.length} (중복 -${allRawPapers.length - uniquePapers.length}) → ` +
      `keyword=${keywordPassed.length} (-${uniquePapers.length - keywordPassed.length}) → ` +
      `non-review=${reviewFiltered.length} (-${keywordPassed.length - reviewFiltered.length}) → ` +
      `selected=${selectedPapers.length} (상한 15편, -${reviewFiltered.length - selectedPapers.length})`
    )
    console.log(`[collect-bg] ${elapsed()} 키워드 사전: 내장 ${KEYWORDS.length}개 + DB ${extraKeywords.length}개`)

    // 필터 통과 논문이 0개면 원인 진단 로그
    if (uniquePapers.length > 0 && keywordPassed.length === 0) {
      console.warn(`[collect-bg] ⚠ KEYWORD FILTER wiped all ${uniquePapers.length} papers. Sample titles:`)
      uniquePapers.slice(0, 5).forEach((p, i) =>
        console.warn(`[collect-bg]   [${i}] "${p.title}" (abstract length=${p.abstract?.length ?? 0})`)
      )
    }

    // 수집량이 비정상적으로 적으면 원인 후보를 함께 출력한다.
    const LOW_YIELD_THRESHOLD = 5
    if (selectedPapers.length < LOW_YIELD_THRESHOLD) {
      const failedJournals = _journalStats.filter(s => s.outcome !== 'ok')
      const missedTotal = _journalStats
        .filter(s => s.outcome === 'ok' && s.total > s.fetched)
        .reduce((sum, s) => sum + (s.total - s.fetched), 0)

      console.warn(`[collect-bg] 🚨 LOW YIELD: Vol.${newIssueNumber} 최종 ${selectedPapers.length}편 (기준 ${LOW_YIELD_THRESHOLD}편 미만)`)
      console.warn(`[collect-bg] 🚨   원인 후보:`)
      if (authorPaperCount === 0)
        console.warn(`[collect-bg] 🚨   - 저자 수집 0편 (저자 ${authorList.length}명) → S2 API 응답 로그 확인`)
      if (failedJournals.length > 0)
        console.warn(`[collect-bg] 🚨   - 저널 ${failedJournals.length}/${_journalStats.length}개 수집 실패 (Crossref rate limit 의심)`)
      if (missedTotal > 0)
        console.warn(`[collect-bg] 🚨   - rows 상한으로 ${missedTotal}편 미조회 (고발행량 저널이 잘림)`)
      if (uniquePapers.length > 0)
        console.warn(`[collect-bg] 🚨   - 키워드 필터 통과율 ${keywordPassed.length}/${uniquePapers.length} (${Math.round(keywordPassed.length / uniquePapers.length * 100)}%)`)
      if (allRawPapers.length > 0 && uniquePapers.length / allRawPapers.length < 0.5)
        console.warn(`[collect-bg] 🚨   - 중복 제거율 ${Math.round((1 - uniquePapers.length / allRawPapers.length) * 100)}% (기존 DB와 과다 중복)`)

      // 탈락한 논문 샘플 — 키워드 사전이 실제 논문과 안 맞는지 눈으로 확인용
      const rejected = uniquePapers.filter(p => !keywordPassed.includes(p))
      if (rejected.length > 0) {
        console.warn(`[collect-bg] 🚨   키워드 탈락 샘플 (${rejected.length}편 중 5편):`)
        rejected.slice(0, 5).forEach((p, i) =>
          console.warn(`[collect-bg] 🚨     [${i}] "${(p.title || '').slice(0, 80)}" (${p.journal}, abstract=${p.abstract?.length ?? 0}자)`)
        )
      }
    }

    if (selectedPapers.length === 0) {
      console.warn(`[collect-bg] ⚠ No papers selected. raw=${allRawPapers.length} unique=${uniquePapers.length} keywordPassed=${keywordPassed.length}`)
      return
    }

    // ── 5.5. all_papers 저장 ────────────────────────────────────
    step = 'save-all-papers'
    await supabase.from('all_papers').delete().eq('issue_number', newIssueNumber)
    if (keywordPassed.length > 0) {
      const tierOf = (j: string) => {
        const IF = JOURNAL_IF_MAP[j] || 0
        return IF >= 40 ? 'crown' : IF >= 25 ? 'top' : IF >= 15 ? 'high' : IF >= 8 ? 'mid' : 'applied'
      }
      const { error: allPapersErr } = await supabase.from('all_papers').insert(
        keywordPassed.map((p: any) => ({
          issue_number: newIssueNumber,
          title: p.title,
          authors: p.authors,
          journal: p.journal,
          journal_tier: tierOf(p.journal),
          year: p.year,
          doi: p.doi || null,
          matched_keywords: getMatchedKeywords(p.title || '', p.abstract || '', extraKeywords),
        }))
      )
      if (allPapersErr) console.warn(`[collect-bg] all_papers insert error: ${allPapersErr.message}`)
      else console.log(`[collect-bg] ${elapsed()} all_papers saved: ${keywordPassed.length}`)
    }

    // ── 6. AI 요약 + 한국어 제목 (5개씩 배치) ───────────────────
    step = 'generate-summaries'
    console.log(`[collect-bg] ${elapsed()} generating summaries for ${selectedPapers.length} papers (batches of 5)...`)

    const summaryResults = await batchRun(
      selectedPapers,
      p => generateBullets(anthropic, p.title, p.abstract || '', p.journal),
      5
    )
    console.log(`[collect-bg] ${elapsed()} bullets done`)

    const titleKoResults = await batchRun(
      selectedPapers,
      p => generateTitleKo(anthropic, p.title),
      5
    )
    console.log(`[collect-bg] ${elapsed()} titleKo done`)

    // 소속/이미지는 nice-to-have — 전체를 병렬로 처리하되 개별 timeout 적용
    const [affiliationsResults, tocImageResults] = await Promise.all([
      Promise.all(selectedPapers.map(p => p.doi ? fetchAffiliations(p.doi) : Promise.resolve({}))),
      Promise.all(selectedPapers.map(p => p.doi ? fetchTocImage(p.doi) : Promise.resolve(null))),
    ])
    console.log(`[collect-bg] ${elapsed()} affiliations+images done`)

    const processedPapers = selectedPapers.map((paper, i) => {
      const journalIF = JOURNAL_IF_MAP[paper.journal] || 0
      const journal_tier =
        journalIF >= 40 ? 'crown' : journalIF >= 25 ? 'top' :
        journalIF >= 15 ? 'high' : journalIF >= 8  ? 'mid' : 'applied'
      const aff = affiliationsResults[i]
      return {
        issue_number: newIssueNumber,
        title: paper.title,
        title_ko: titleKoResults[i] || null,
        authors: paper.authors,
        affiliations: Object.keys(aff).length ? aff : null,
        journal: paper.journal,
        journal_tier,
        year: paper.year,
        doi: paper.doi || null,
        abstract: paper.abstract || null,
        summary_bullets: summaryResults[i],
        related_papers: [],
        image_url: tocImageResults[i] || null,
        source: 'auto',
      }
    })

    // ── 7. 밈 요약 생성 ─────────────────────────────────────────
    step = 'generate-horoscope'
    const horoscope = await generateHoroscope(
      anthropic, newIssueNumber,
      selectedPapers.map(p => p.title),
      selectedPapers.map(p => p.abstract || '')
    )
    console.log(`[collect-bg] ${elapsed()} horoscope done`)

    // ── 8. DB 저장 ──────────────────────────────────────────────
    step = 'insert-issue'
    const { error: issueError } = await supabase.from('issues').insert({
      issue_number: newIssueNumber,
      published_at: new Date().toISOString().split('T')[0],
      horoscope,
    })
    if (issueError) throw new Error(`issues insert 실패: ${issueError.message} (code: ${issueError.code})`)

    step = 'insert-papers'
    const { error: papersError } = await supabase.from('papers').insert(processedPapers)
    if (papersError) throw new Error(`papers insert 실패: ${papersError.message} (code: ${papersError.code})`)

    console.log(
      `[collect-bg] ${elapsed()} DB saved ✓ Vol.${newIssueNumber} — ` +
      `papers=${processedPapers.length}편, all_papers=${keywordPassed.length}편 ` +
      `(raw ${allRawPapers.length} → 최종 ${processedPapers.length}, 통과율 ${allRawPapers.length ? (processedPapers.length / allRawPapers.length * 100).toFixed(1) : 0}%)`
    )

    await backfillPromise.catch((e: unknown) => console.error(`[collect-bg] backfill error: ${serializeError(e)}`))

    // ── 9. 이메일 알림 ─────────────────────────────────────────────
    // Netlify 배포 URL은 process.env.URL로 자동 주입됨
    const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://labpaper.netlify.app'
    const notifyRes = await withTimeout(
      fetch(`${siteUrl}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ issue_number: newIssueNumber }),
      }),
      60_000, null
    )
    if (notifyRes?.ok) {
      console.log(`[collect-bg] ${elapsed()} ✉️ notify sent ✓`)
    } else {
      console.warn(`[collect-bg] ${elapsed()} ⚠️ notify failed: HTTP ${notifyRes?.status}`)
    }

    console.log(`[collect-bg] ${elapsed()} ✅ DONE Vol.${newIssueNumber}`)
  } catch (error) {
    console.error(`[collect-bg] ${elapsed()} ❌ FAILED at step="${step}": ${serializeError(error)}`)
  }
}

// '-background' 접미사 → Netlify 백그라운드 함수 (15분 타임아웃)
// 주간 트리거는 GitHub Actions(.github/workflows/weekly-collect.yml)가 담당.
// 이 함수는 HTTP POST로만 호출됨 (Netlify schedule 미사용 — background 함수는
// scheduled 함수와 동시 등록 불가하여 제거).
// 엔드포인트: /.netlify/functions/collect-background
export const config: Config = {}
