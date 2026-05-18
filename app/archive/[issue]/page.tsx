import { supabase } from '@/lib/supabase'
import PaperCard from '@/components/PaperCard'
import HoroscopeCard from '@/components/HoroscopeCard'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 3600

export default async function ArchiveIssuePage({ params }: { params: Promise<{ issue: string }> }) {
  const { issue: issueParam } = await params
  const issueNumber = parseInt(issueParam)
  if (isNaN(issueNumber)) notFound()

  const { data: issue } = await supabase
    .from('issues')
    .select('*')
    .eq('issue_number', issueNumber)
    .single()

  if (!issue) notFound()

  const { data: papers } = await supabase
    .from('papers')
    .select('*')
    .eq('issue_number', issueNumber)
    .order('created_at', { ascending: true })

  const publishedDate = new Date(issue.published_at).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-8">
      <div className="mb-6">
        <Link
          href="/archive"
          className="text-sm transition-opacity hover:opacity-60"
          style={{ color: '#86868b' }}
        >
          ← 지난 호 목록
        </Link>
      </div>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1d1d1f' }}>LabPaper</h1>
          <p className="text-sm mt-0.5" style={{ color: '#86868b' }}>
            {publishedDate} · 논문 {(papers || []).length}편
          </p>
        </div>
        <span
          className="text-xs font-medium px-3 py-1 mt-1"
          style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: 20 }}
        >
          Vol. {issue.issue_number}
        </span>
      </div>

      {issue.horoscope && <HoroscopeCard horoscope={issue.horoscope} />}

      {(papers || []).length > 0 ? (
        <div className="space-y-4 mt-6">
          {(papers || []).map((paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}
        </div>
      ) : (
        <p className="text-center py-16" style={{ color: '#86868b' }}>
          이 호에 논문이 없습니다.
        </p>
      )}
    </main>
  )
}
