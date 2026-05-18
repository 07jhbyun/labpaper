import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  fetchPapersByAuthor,
  fetchPapersByJournal,
  findRelatedPapers,
  fetchAffiliations,
  fetchAbstract,
  JOURNAL_ISSN_MAP,
  JOURNAL_IF_MAP,
  passesKeywordFilter,
  isReviewPaper,
} from '@/lib/fetch-papers'
import { generateSummaryBullets, generateTitleKo, generateWeeklyHoroscope } from '@/lib/ai'

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try { return JSON.stringify(error) } catch { return String(error) }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET
  if (auth !== `Bearer ${cronSecret}`) {
    console.log('[collect] Unauthorized. header:', auth, 'expected: Bearer', cronSecret)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let step = 'init'
  try {
    // ── 1. 이슈 번호 ──────────────────────────────────────────────
    step = 'fetch-issue-number'
    const { data: lastIssue, error: issueQueryError } = await supabaseAdmin
      .from('issues')
      .select('issue_number')
      .order('issue_number', { ascending: false })
      .limit(1)
      .single()

    if (issueQueryError && issueQueryError.code !== 'PGRST116') {
      // PGRST116 = "no rows" (첫 이슈일 때 정상)
      throw new Error(`issues 조회 실패: ${issueQueryError.message}`)
    }
    const newIssueNumber = (lastIssue?.issue_number || 0) + 1
    console.log(`[collect] step=${step} newIssueNumber=${newIssueNumber}`)

    // ── 2. 저자 목록 ──────────────────────────────────────────────
    step = 'fetch-authors'
    const { data: authors, error: authorsError } = await supabaseAdmin
      .from('followed_authors')
      .select('name')
      .eq('status', 'active')
    if (authorsError) throw new Error(`followed_authors 조회 실패: ${authorsError.message}`)
    console.log(`[collect] step=${step} authors=${authors?.length ?? 0}`)

    // ── 3. 기존 논문 중복 체크 + abstract 없는 논문 backfill 병렬 시작 ──
    step = 'fetch-existing-papers'
    const [{ data: existingPapers }, { data: noAbstractPapers }] = await Promise.all([
      supabaseAdmin.from('papers').select('doi, title'),
      supabaseAdmin.from('papers').select('id, doi')
        .is('abstract', null).not('doi', 'is', null).limit(25),
    ])

    const existingDois = new Set<string>(
      (existingPapers || []).map(p => p.doi).filter(Boolean)
    )
    const existingTitles = new Set<string>(
      (existingPapers || []).map(p => normalizeTitle(p.title))
    )
    console.log(`[collect] step=${step} existingDois=${existingDois.size} noAbstract=${noAbstractPapers?.length ?? 0}`)

    // 기존 논문 backfill — 새 이슈 처리와 병렬로 실행
    const backfillPromise = noAbstractPapers?.length
      ? Promise.all(noAbstractPapers.map(async p => {
          const abstract = await fetchAbstract(p.doi)
          if (abstract) await supabaseAdmin.from('papers').update({ abstract }).eq('id', p.id)
        })).then(() => console.log(`[collect] backfilled abstract for up to ${noAbstractPapers.length} papers`))
      : Promise.resolve()

    // ── 4. 논문 수집 ──────────────────────────────────────────────
    step = 'collect-papers'
    const allRawPapers: any[] = []

    for (const author of (authors || []).slice(0, 10)) {
      const papers = await fetchPapersByAuthor(author.name)
      allRawPapers.push(...papers.map(p => ({ ...p, source: 'auto' })))
      await sleep(500)
    }

    for (const [journalName, issn] of Object.entries(JOURNAL_ISSN_MAP)) {
      const papers = await fetchPapersByJournal(journalName, issn)
      allRawPapers.push(...papers.map(p => ({ ...p, journal: journalName, source: 'auto' })))
      await sleep(300)
    }
    console.log(`[collect] step=${step} raw=${allRawPapers.length}`)

    // ── 5. 중복 제거 (DOI + 정규화 제목 이중 체크) ───────────────
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
    console.log(`[collect] step=${step} unique=${uniquePapers.length}`)

    // ── 5.5. 신규 논문 abstract 보완 ─────────────────────────────
    step = 'fill-abstracts'
    const missingAbstractPapers = uniquePapers.filter(p => !p.abstract && p.doi)
    if (missingAbstractPapers.length > 0) {
      const filled = await Promise.all(missingAbstractPapers.map(p => fetchAbstract(p.doi)))
      missingAbstractPapers.forEach((p, i) => { if (filled[i]) p.abstract = filled[i] })
      console.log(`[collect] step=${step} filled=${filled.filter(Boolean).length}/${missingAbstractPapers.length}`)
    }

    // ── 6. 키워드/리뷰 필터 + 정렬 ───────────────────────────────
    step = 'filter-papers'
    const keywordPassed = uniquePapers.filter(p => passesKeywordFilter(p.title || '', p.abstract || ''))
    const selectedPapers = keywordPassed
      .filter(p => !isReviewPaper(p.title || '', p.abstract || ''))
      .sort((a, b) => (JOURNAL_IF_MAP[b.journal] || 0) - (JOURNAL_IF_MAP[a.journal] || 0))
      .slice(0, 15)
    console.log(`[collect] step=${step} keywordPassed=${keywordPassed.length} selected=${selectedPapers.length}`)

    if (selectedPapers.length === 0) {
      return NextResponse.json({
        success: false,
        error: `수집된 논문 ${allRawPapers.length}편 중 키워드/리뷰 필터를 통과한 논문이 없습니다.`,
        debug: { raw: allRawPapers.length, unique: uniquePapers.length, keywordPassed: keywordPassed.length },
      })
    }

    // ── 7. AI 요약 + 한국어 제목 + 소속 병렬 생성 ───────────────
    step = 'generate-summaries'
    const [bulletsResults, titleKoResults, affiliationsResults, relatedResults, tocImageResults] = await Promise.all([
      Promise.all(selectedPapers.map(p => generateSummaryBullets(p.title, p.abstract || '', p.journal))),
      Promise.all(selectedPapers.map(p => generateTitleKo(p.title))),
      Promise.all(selectedPapers.map(p => p.doi ? fetchAffiliations(p.doi) : Promise.resolve({}))),
      Promise.all(selectedPapers.map(p => findRelatedPapers(p.title))),
      Promise.all(selectedPapers.map(p => p.doi ? fetchTocImage(p.doi) : Promise.resolve(null))),
    ])

    const processedPapers = selectedPapers.map((paper, i) => {
      const journalIF = JOURNAL_IF_MAP[paper.journal] || 0
      const journal_tier =
        journalIF >= 40 ? 'crown' :
        journalIF >= 25 ? 'top' :
        journalIF >= 15 ? 'high' :
        journalIF >= 8  ? 'mid' : 'applied'
      return {
        issue_number: newIssueNumber,
        title: paper.title,
        title_ko: titleKoResults[i] || null,
        authors: paper.authors,
        affiliations: Object.keys(affiliationsResults[i]).length ? affiliationsResults[i] : null,
        journal: paper.journal,
        journal_tier,
        year: paper.year,
        doi: paper.doi || null,
        abstract: paper.abstract || null,
        summary_bullets: bulletsResults[i],
        related_papers: relatedResults[i],
        image_url: tocImageResults[i] || null,
        source: 'auto',
      }
    })
    console.log(`[collect] step=${step} processedPapers=${processedPapers.length}`)

    // ── 8. 밈 요약 ────────────────────────────────────────────────
    step = 'generate-horoscope'
    const horoscope = await generateWeeklyHoroscope(
      newIssueNumber,
      selectedPapers.map(p => p.title),
      selectedPapers.map(p => p.abstract || '')
    )
    console.log(`[collect] step=${step} done`)

    // ── 9. DB 저장 ────────────────────────────────────────────────
    step = 'insert-issue'
    const { error: issueError } = await supabaseAdmin.from('issues').insert({
      issue_number: newIssueNumber,
      published_at: new Date().toISOString().split('T')[0],
      horoscope,
    })
    if (issueError) throw new Error(`issues insert 실패: ${issueError.message} (code: ${issueError.code})`)
    console.log(`[collect] step=${step} done`)

    step = 'insert-papers'
    const { error: papersError } = await supabaseAdmin.from('papers').insert(processedPapers)
    if (papersError) throw new Error(`papers insert 실패: ${papersError.message} (code: ${papersError.code})`)
    console.log(`[collect] step=${step} done`)

    // ── 10. backfill 완료 대기 + 이메일 알림 ─────────────────────
    await backfillPromise.catch(e => console.error('[collect] backfill error:', e))

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    fetch(`${siteUrl}/api/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ issue_number: newIssueNumber }),
    }).catch(e => console.error('[collect] notify failed:', e))

    return NextResponse.json({
      success: true,
      issue_number: newIssueNumber,
      papers_collected: processedPapers.length,
    })

  } catch (error) {
    const msg = serializeError(error)
    console.error(`[collect] FAILED at step="${step}":`, error)
    return NextResponse.json({ error: `[${step}] ${msg}` }, { status: 500 })
  }
}

async function fetchTocImage(doi: string): Promise<string | null> {
  // 1. Semantic Scholar figures (인덱싱된 논문에 가장 신뢰도 높음)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=figures`,
      { signal: controller.signal, headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const url = data.figures?.[0]?.imageUrls?.[0]
      if (url) return url
    }
  } catch {}

  // 2. Fallback: DOI 페이지 og:image (일부 저널에서 동작)
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}
