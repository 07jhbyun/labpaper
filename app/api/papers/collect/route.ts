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

export async function POST(req: NextRequest) {
  // 보안: cron secret 확인
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 현재 최대 이슈 번호
    const { data: lastIssue } = await supabaseAdmin
      .from('issues')
      .select('issue_number')
      .order('issue_number', { ascending: false })
      .limit(1)
      .single()

    const newIssueNumber = (lastIssue?.issue_number || 0) + 1

    // 팔로우 저자 목록
    const { data: authors } = await supabaseAdmin
      .from('followed_authors')
      .select('name')
      .eq('status', 'active')

    // DB에 이미 존재하는 논문 DOI + 제목 앞 50자 조회 (전체 papers 테이블)
    const { data: existingPapers } = await supabaseAdmin
      .from('papers')
      .select('doi, title')

    const existingDois = new Set<string>(
      (existingPapers || []).map(p => p.doi).filter(Boolean)
    )
    const existingTitlePrefixes = new Set<string>(
      (existingPapers || [])
        .filter(p => !p.doi)
        .map(p => normalizeTitle(p.title))
    )

    // 논문 수집
    const allRawPapers: any[] = []

    // 저자별 수집
    for (const author of (authors || []).slice(0, 10)) {
      const papers = await fetchPapersByAuthor(author.name)
      allRawPapers.push(...papers.map(p => ({ ...p, source: 'auto' })))
      await sleep(500)
    }

    // 모든 저널에서 수집 (JOURNAL_ISSN_MAP 전체)
    for (const [journalName, issn] of Object.entries(JOURNAL_ISSN_MAP)) {
      const papers = await fetchPapersByJournal(journalName, issn)
      allRawPapers.push(...papers.map(p => ({ ...p, journal: journalName, source: 'auto' })))
      await sleep(300)
    }

    // 1차 중복 제거: 이번 수집 내 DOI 기준
    const seen = new Set<string>()
    const deduped = allRawPapers.filter(p => {
      if (!p.doi) return true
      if (seen.has(p.doi)) return false
      seen.add(p.doi)
      return true
    })

    // 2차 중복 제거: DB에 이미 있는 논문 제외
    const uniquePapers = deduped.filter(p => {
      if (p.doi && existingDois.has(p.doi)) return false
      if (!p.doi && existingTitlePrefixes.has(normalizeTitle(p.title || ''))) return false
      return true
    })

    // 키워드 필터 → 리뷰 제외 → IF 높은 순 정렬 → 상위 15개
    const selectedPapers = uniquePapers
      .filter(p => passesKeywordFilter(p.title || '', p.abstract || ''))
      .filter(p => !isReviewPaper(p.title || '', p.abstract || ''))
      .sort((a, b) => (JOURNAL_IF_MAP[b.journal] || 0) - (JOURNAL_IF_MAP[a.journal] || 0))
      .slice(0, 15)

    // AI로 각 논문 요약 생성 + 관련 논문 검색
    const processedPapers = []
    for (const paper of selectedPapers) {
      const [bullets, related] = await Promise.all([
        generateSummaryBullets(paper.title, paper.abstract || '', paper.journal),
        findRelatedPapers(paper.title)
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
        source: 'auto'
      })
    }

    // 주간 밈 요약 생성 (제목 + abstract 전달)
    const horoscope = await generateWeeklyHoroscope(
      newIssueNumber,
      selectedPapers.map(p => p.title),
      selectedPapers.map(p => p.abstract || '')
    )

    // DB 저장
    const { error: issueError } = await supabaseAdmin.from('issues').insert({
      issue_number: newIssueNumber,
      published_at: new Date().toISOString().split('T')[0],
      horoscope
    })

    if (issueError) throw issueError

    const { error: papersError } = await supabaseAdmin
      .from('papers')
      .insert(processedPapers)

    if (papersError) throw papersError

    return NextResponse.json({
      success: true,
      issue_number: newIssueNumber,
      papers_collected: processedPapers.length
    })

  } catch (error) {
    console.error('Collect error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 50)
}
