import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  fetchPapersByAuthor,
  fetchPapersByJournal,
  findRelatedPapers,
  JOURNAL_ISSN_MAP,
  JOURNAL_IF_MAP,
  passesKeywordFilter,
  isReviewPaper,
} from '@/lib/fetch-papers'
import { generateSummaryBullets, generateWeeklyHoroscope } from '@/lib/ai'

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

    // ── 3. 기존 논문 중복 체크용 ──────────────────────────────────
    step = 'fetch-existing-papers'
    const { data: existingPapers } = await supabaseAdmin
      .from('papers')
      .select('doi, title')

    const existingDois = new Set<string>(
      (existingPapers || []).map(p => p.doi).filter(Boolean)
    )
    const existingTitlePrefixes = new Set<string>(
      (existingPapers || []).filter(p => !p.doi).map(p => normalizeTitle(p.title))
    )
    console.log(`[collect] step=${step} existingDois=${existingDois.size}`)

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

    // ── 5. 중복 제거 ──────────────────────────────────────────────
    step = 'deduplicate'
    const seen = new Set<string>()
    const deduped = allRawPapers.filter(p => {
      if (!p.doi) return true
      if (seen.has(p.doi)) return false
      seen.add(p.doi)
      return true
    })
    const uniquePapers = deduped.filter(p => {
      if (p.doi && existingDois.has(p.doi)) return false
      if (!p.doi && existingTitlePrefixes.has(normalizeTitle(p.title || ''))) return false
      return true
    })
    console.log(`[collect] step=${step} deduped=${deduped.length} unique=${uniquePapers.length}`)

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

    // ── 7. AI 요약 생성 ───────────────────────────────────────────
    step = 'generate-summaries'
    const processedPapers = []
    for (const paper of selectedPapers) {
      console.log(`[collect] summarizing: ${paper.title.slice(0, 60)}`)
      const [bullets, related] = await Promise.all([
        generateSummaryBullets(paper.title, paper.abstract || '', paper.journal),
        findRelatedPapers(paper.title),
      ])

      const journalIF = JOURNAL_IF_MAP[paper.journal] || 0
      const journal_tier =
        journalIF >= 40 ? 'crown' :
        journalIF >= 25 ? 'top' :
        journalIF >= 15 ? 'high' :
        journalIF >= 8  ? 'mid' : 'applied'

      processedPapers.push({
        issue_number: newIssueNumber,
        title: paper.title,
        authors: paper.authors,
        journal: paper.journal,
        journal_tier,
        year: paper.year,
        doi: paper.doi || null,
        abstract: paper.abstract || null,
        summary_bullets: bullets,
        related_papers: related,
        source: 'auto',
      })
    }
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

    // ── 10. 이메일 알림 (fire and forget) ────────────────────────
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 50)
}
