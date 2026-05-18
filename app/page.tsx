import { supabase } from '@/lib/supabase'
import PaperCard from '@/components/PaperCard'
import HoroscopeCard from '@/components/HoroscopeCard'
import type { Paper, Issue } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function getCurrentIssue(): Promise<{ issue: Issue | null; papers: Paper[] }> {
  const { data: issue } = await supabase
    .from('issues')
    .select('*')
    .order('issue_number', { ascending: false })
    .limit(1)
    .single()

  if (!issue) return { issue: null, papers: [] }

  const { data: papers } = await supabase
    .from('papers')
    .select('*')
    .eq('issue_number', issue.issue_number)
    .order('created_at', { ascending: true })

  return { issue, papers: papers || [] }
}

export default async function HomePage() {
  const { issue, papers } = await getCurrentIssue()

  if (!issue) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-16 sm:py-20 text-center">
        <p className="text-lg" style={{ color: '#86868b' }}>아직 발행된 뉴스레터가 없습니다.</p>
        <p className="text-sm mt-2" style={{ color: '#c7c7cc' }}>매주 월요일 오전 9시에 업데이트됩니다.</p>
      </main>
    )
  }

  const publishedDate = new Date(issue.published_at).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-8">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1d1d1f' }}>LabPaper</h1>
          <p className="text-sm mt-0.5" style={{ color: '#86868b' }}>
            {publishedDate} · 논문 {papers.length}편
          </p>
        </div>
        <span
          className="text-xs font-medium px-3 py-1 mt-1"
          style={{
            backgroundColor: '#f0fdf4',
            color: '#166534',
            borderRadius: 20,
          }}
        >
          Vol. {issue.issue_number}
        </span>
      </div>

      {/* 주간 밈 요약 */}
      {issue.horoscope && <HoroscopeCard horoscope={issue.horoscope} />}

      {/* 논문 목록 */}
      {papers.length > 0 ? (
        <div className="space-y-4 mt-6">
          {papers.map((paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}
        </div>
      ) : (
        <p className="text-center py-16" style={{ color: '#86868b' }}>
          이번 주 논문을 준비 중입니다.
        </p>
      )}
    </main>
  )
}
