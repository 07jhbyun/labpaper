import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'

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
]
const REVIEW_TITLE_KW = ['review', 'perspective', 'progress', 'outlook', 'highlight']
const REVIEW_ABSTRACT_KW = ['this review', 'in this review', 'we review']

// ── 유틸 ────────────────────────────────────────────────────────────────────

function passesKeywordFilter(title: string, abstract: string) {
  const text = `${title} ${abstract}`.toLowerCase()
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
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
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try { return JSON.stringify(e) } catch { return String(e) }
}

// ── 논문 수집 ────────────────────────────────────────────────────────────────

async function fetchByJournal(journalName: string, issn: string) {
  try {
    const from = new Date()
    from.setDate(from.getDate() - 14)
    const fromStr = from.toISOString().split('T')[0]
    const res = await fetch(
      `${CROSSREF_API}?filter=issn:${issn},from-pub-date:${fromStr}&sort=published&order=desc&rows=10&select=title,author,published,DOI,abstract,container-title`,
      { headers: { 'User-Agent': 'LabPaper/1.0 (mailto:07jhbyun@gmail.com)' } }
    )
    const data = await res.json()
    return (data.message?.items || []).map((item: any) => ({
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      authors: item.author?.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).join(', ') || '',
      journal: journalName,
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      doi: item.DOI,
      abstract: item.abstract?.replace(/<[^>]*>/g, '') || '',
      source: 'auto',
    }))
  } catch {
    return []
  }
}

async function fetchByAuthor(authorName: string) {
  try {
    const res = await fetch(
      `${SEMANTIC_SCHOLAR_API}/author/search?query=${encodeURIComponent(authorName)}&fields=authorId,name`,
      { headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
    const data = await res.json()
    if (!data.data?.length) return []
    const authorId = data.data[0].authorId
    const papersRes = await fetch(
      `${SEMANTIC_SCHOLAR_API}/author/${authorId}/papers?fields=title,authors,year,journal,externalIds,abstract,tldr&limit=5&sort=publicationDate`,
      { headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
    const papersData = await papersRes.json()
    return (papersData.data || [])
      .filter((p: any) => p.year >= new Date().getFullYear())
      .map((p: any) => ({
        title: p.title,
        authors: p.authors?.map((a: any) => a.name).join(', ') || authorName,
        journal: p.journal?.name || 'Unknown',
        year: p.year,
        doi: p.externalIds?.DOI,
        abstract: p.abstract || p.tldr?.text || '',
        source: 'auto',
      }))
  } catch {
    return []
  }
}

// ── AI ──────────────────────────────────────────────────────────────────────

async function fetchTocImage(doi: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://doi.org/${doi}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LabPaper/1.0' },
    })
    clearTimeout(timer)
    const html = await res.text()
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    return match?.[1] || null
  } catch {
    return null
  }
}

async function fetchAffiliations(doi: string) {
  try {
    const res = await fetch(
      `${SEMANTIC_SCHOLAR_API}/paper/DOI:${doi}?fields=authors.affiliations,authors.name`,
      { headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
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

async function generateTitleKo(client: Anthropic, title: string): Promise<string> {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `다음 논문 제목을 한국어로 자연스럽게 번역해줘. 번역문만 답해줘.\n${title}`,
      }]
    })
    return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

async function generateBullets(client: Anthropic, title: string, abstract: string, journal: string) {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `다음 논문의 핵심 결과를 한국어 bullet 3개로 요약해줘. 수치/결과 포함, 1-2문장씩.
JSON 배열만: ["bullet1","bullet2","bullet3"]
제목: ${title}\n저널: ${journal}\n초록: ${abstract.slice(0, 800)}`
      }]
    })
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
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `너는 연구실 막내 대학원생. 이번 주 논문을 밈 감성으로 요약해줘. 한국어.
이번 주 논문:\n${context}\n
JSON만 답해줘:
{"paper_luck":"전체 분위기 한 줄 밈","experiment_luck":"황당한 실험/결과 개그","citation_luck":"대학원생 공감 포인트","reviewer_luck":"논문 한 줄 평"}`
      }]
    })
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

async function generateSubject(client: Anthropic, issueNumber: number, titles: string[]) {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `이번 주 LabPaper 뉴스레터 이메일 제목을 한 줄로 만들어줘.
톤: 장난스럽고 약간 도발적, 대학원생 감성. 이모지 1개 포함.
예시: "이번 주 논문 안 읽니? 👀", "당신의 라이벌은 지금 이 논문 읽는 중입니다"
키워드: ${titles.slice(0, 5).join(' / ')}
제목 텍스트만 답해줘. 따옴표 없이.`
      }]
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    return `[LabPaper] ${text}`
  } catch {
    const fallbacks = ['이번 주 논문 안 읽니? 👀', '당신의 라이벌은 지금 읽는 중 📄', `Vol.${issueNumber} 도착했습니다 🔬`]
    return `[LabPaper] ${fallbacks[issueNumber % fallbacks.length]}`
  }
}

// ── 이메일 ───────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  crown: { bg: '#fff7e6', text: '#b45309', icon: '👑' },
  top:   { bg: '#f3e8ff', text: '#6b21a8', icon: '🏆' },
  high:  { bg: '#eff6ff', text: '#1d4ed8', icon: '🥇' },
  mid:   { bg: '#f0fdf4', text: '#166534', icon: '🥈' },
  applied: { bg: '#f9fafb', text: '#374151', icon: '🥉' },
}

function buildEmailHtml(issueNumber: number, papers: any[], horoscope: any, name?: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://labpaper.netlify.app'
  const greeting = name ? `안녕하세요, ${name}님!` : '안녕하세요!'
  const papersHtml = papers.map((p, i) => {
    const style = TIER_STYLES[p.journal_tier] ?? TIER_STYLES['applied']
    const doiUrl = p.doi ? `https://doi.org/${p.doi}` : siteUrl
    const isLast = i === papers.length - 1
    return `<div style="padding:14px 20px;${isLast ? '' : 'border-bottom:1px solid #f2f2f7;'}">
      <div style="margin-bottom:5px;">
        <span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background-color:${style.bg};color:${style.text};">${style.icon} ${p.journal}</span>
        ${JOURNAL_IF_MAP[p.journal] ? `<span style="font-size:11px;color:#86868b;margin-left:6px;">IF ${JOURNAL_IF_MAP[p.journal].toFixed(1)}</span>` : ''}
      </div>
      <a href="${doiUrl}" style="font-size:14px;font-weight:600;color:#1d1d1f;text-decoration:none;line-height:1.5;">${p.title}</a>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:28px;">
    <h1 style="font-size:26px;font-weight:700;color:#1d1d1f;margin:0 0 4px;">LabPaper</h1>
    <p style="font-size:13px;color:#86868b;margin:0;">Vol. ${issueNumber} · 주간 논문 뉴스레터</p>
  </div>
  <p style="font-size:15px;color:#3a3a3c;margin:0 0 24px;">${greeting} 이번 주 논문 ${papers.length}편이 도착했습니다.</p>
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${siteUrl}" style="display:inline-block;background-color:#0071e3;color:#ffffff;font-size:15px;font-weight:600;padding:13px 32px;border-radius:980px;text-decoration:none;">LabPaper 바로가기</a>
  </div>
  <div style="background-color:#fffbeb;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
    <p style="font-size:12px;font-weight:600;color:#92400e;margin:0 0 6px;">🧪 이번 주 논문 요약 (밈버전)</p>
    <p style="font-size:14px;color:#b45309;margin:0;line-height:1.65;">${horoscope.reviewer_luck}</p>
  </div>
  <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:28px;">${papersHtml}</div>
  <div style="text-align:center;margin-bottom:36px;">
    <a href="${siteUrl}" style="display:inline-block;background-color:#1d1d1f;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:980px;text-decoration:none;">지금 보러가기 →</a>
  </div>
  <p style="text-align:center;font-size:12px;color:#c7c7cc;margin:0;">매주 월요일, 우리 분야 핵심 논문을 한눈에</p>
</div></body></html>`
}

// ── 메인 ────────────────────────────────────────────────────────────────────

export default async (req: Request) => {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET
  if (auth !== `Bearer ${cronSecret}`) {
    console.error('[collect-bg] Unauthorized')
    return  // 202 반환되지만 아무것도 처리 안 함
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
    console.log(`[collect-bg] issueNumber=${newIssueNumber}`)

    // ── 2. 기존 논문 + 저자 목록 병렬 조회 ──────────────────────
    step = 'fetch-meta'
    const [{ data: authors }, { data: existingPapers }] = await Promise.all([
      supabase.from('followed_authors').select('name').eq('status', 'active'),
      supabase.from('papers').select('doi, title'),
    ])
    const existingDois = new Set<string>((existingPapers || []).map(p => p.doi).filter(Boolean))
    const existingTitles = new Set<string>((existingPapers || []).map(p => normalizeTitle(p.title)))
    console.log(`[collect-bg] authors=${authors?.length ?? 0} existingDois=${existingDois.size}`)

    // ── 3. 저자 + 저널 전체 병렬 수집 ───────────────────────────
    step = 'collect-papers'
    const [authorResults, journalResults] = await Promise.all([
      Promise.all((authors || []).slice(0, 10).map(a => fetchByAuthor(a.name))),
      Promise.all(Object.entries(JOURNAL_ISSN_MAP).map(([name, issn]) => fetchByJournal(name, issn))),
    ])
    const allRawPapers = [...authorResults.flat(), ...journalResults.flat()]
    console.log(`[collect-bg] raw=${allRawPapers.length}`)

    // ── 4. 중복 제거 (DOI + 정규화 제목 이중 체크) ─────────────
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
    console.log(`[collect-bg] unique=${uniquePapers.length}`)

    // ── 5. 키워드/리뷰 필터 + 정렬 ─────────────────────────────
    step = 'filter-papers'
    const selectedPapers = uniquePapers
      .filter(p => passesKeywordFilter(p.title || '', p.abstract || ''))
      .filter(p => !isReviewPaper(p.title || '', p.abstract || ''))
      .sort((a, b) => (JOURNAL_IF_MAP[b.journal] || 0) - (JOURNAL_IF_MAP[a.journal] || 0))
      .slice(0, 15)
    console.log(`[collect-bg] selected=${selectedPapers.length}`)

    if (selectedPapers.length === 0) {
      console.warn(`[collect-bg] No papers passed filters. raw=${allRawPapers.length}`)
      return
    }

    // ── 6. AI 요약 + 한국어 제목 + 소속 전체 병렬 생성 ─────────
    step = 'generate-summaries'
    const [summaryResults, titleKoResults, affiliationsResults, tocImageResults] = await Promise.all([
      Promise.all(selectedPapers.map(p => generateBullets(anthropic, p.title, p.abstract || '', p.journal))),
      Promise.all(selectedPapers.map(p => generateTitleKo(anthropic, p.title))),
      Promise.all(selectedPapers.map(p => p.doi ? fetchAffiliations(p.doi) : Promise.resolve({}))),
      Promise.all(selectedPapers.map(p => p.doi ? fetchTocImage(p.doi) : Promise.resolve(null))),
    ])
    console.log(`[collect-bg] summaries+titleKo+affiliations+tocImages done`)

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

    // ── 7. 밈 요약 + 이메일 제목 병렬 생성 ─────────────────────
    step = 'generate-horoscope'
    const [horoscope, emailSubject] = await Promise.all([
      generateHoroscope(anthropic, newIssueNumber, selectedPapers.map(p => p.title), selectedPapers.map(p => p.abstract || '')),
      generateSubject(anthropic, newIssueNumber, selectedPapers.map(p => p.title)),
    ])
    console.log(`[collect-bg] horoscope done. subject="${emailSubject}"`)

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
    console.log(`[collect-bg] DB saved. Vol.${newIssueNumber}, ${processedPapers.length}편`)

    // ── 9. 이메일 발송 ──────────────────────────────────────────
    step = 'send-emails'
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const resend = new Resend(resendKey)
      const { data: subscribers } = await supabase
        .from('subscribers').select('email, name').eq('active', true)

      if (subscribers?.length) {
        await Promise.all(
          subscribers.map(sub =>
            resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'LabPaper <onboarding@resend.dev>',
              to: sub.email,
              subject: emailSubject,
              html: buildEmailHtml(newIssueNumber, processedPapers, horoscope, sub.name || undefined),
            }).catch(e => console.error(`[collect-bg] email failed to ${sub.email}:`, e))
          )
        )
        console.log(`[collect-bg] emails sent to ${subscribers.length}명`)
      }
    }

    console.log(`[collect-bg] ✅ DONE Vol.${newIssueNumber}`)
  } catch (error) {
    console.error(`[collect-bg] ❌ FAILED at step="${step}":`, serializeError(error))
  }
}

// 파일명 '-background' 접미사가 Netlify 백그라운드 함수(15분 타임아웃)를 지정
// 엔드포인트: /.netlify/functions/collect-background
export const config: Config = {
  path: '/api/papers/collect',
}
