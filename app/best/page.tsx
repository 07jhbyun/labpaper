import { supabase } from '@/lib/supabase'
import { JOURNAL_COLORS, JOURNAL_IF_CLIENT_MAP } from '@/lib/supabase'

export const revalidate = 3600

async function getBestPapers(period: 'month' | 'year') {
  const now = new Date()
  const from = period === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), 0, 1)

  const { data: issues } = await supabase
    .from('issues')
    .select('issue_number')
    .gte('published_at', from.toISOString().split('T')[0])

  if (!issues?.length) return []

  const issueNumbers = issues.map(i => i.issue_number)

  const { data: papers } = await supabase
    .from('papers')
    .select(`
      *,
      paper_reaction_counts (
        life_paper_count, must_cite_count, why_here_count, gpt_wrote_count,
        avg_stars, star_count
      )
    `)
    .in('issue_number', issueNumbers)

  return (papers || [])
    .map(p => ({
      ...p,
      total_reactions:
        (p.paper_reaction_counts?.life_paper_count || 0) +
        (p.paper_reaction_counts?.must_cite_count || 0) +
        (p.paper_reaction_counts?.star_count || 0),
    }))
    .sort((a, b) => b.total_reactions - a.total_reactions)
    .slice(0, 10)
}

export default async function BestPage() {
  const [monthly, yearly] = await Promise.all([
    getBestPapers('month'),
    getBestPapers('year'),
  ])

  const now = new Date()
  const monthName = now.toLocaleDateString('ko-KR', { month: 'long' })
  const year = now.getFullYear()

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#1d1d1f' }}>베스트 논문</h1>

      <section className="mb-10">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#3a3a3c' }}>
          <span>🏆</span> {monthName} 베스트
        </h2>
        <BestList papers={monthly} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#3a3a3c' }}>
          <span>🎖️</span> {year}년 베스트
        </h2>
        <BestList papers={yearly} />
      </section>
    </main>
  )
}

const RANK_COLORS = ['#f59e0b', '#9ca3af', '#b45309', '#c7c7cc']

function BestList({ papers }: { papers: any[] }) {
  if (!papers.length) {
    return (
      <p className="text-sm py-6" style={{ color: '#86868b' }}>
        아직 데이터가 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {papers.map((paper, i) => {
        const colors = JOURNAL_COLORS[paper.journal_tier as string] ?? JOURNAL_COLORS['applied']
        const journalIF = JOURNAL_IF_CLIENT_MAP[paper.journal] || 0
        const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null

        return (
          <div
            key={paper.id}
            className="flex gap-4 items-start p-4"
            style={{
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: 12,
            }}
          >
            {/* 순위 */}
            <span
              className="text-lg font-bold flex-shrink-0 w-7 text-center"
              style={{ color: RANK_COLORS[i] ?? '#c7c7cc' }}
            >
              {i + 1}
            </span>

            <div className="flex-1 min-w-0">
              {/* 저널 배지 + IF */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5"
                  style={{
                    backgroundColor: colors.badgeBg,
                    color: colors.badgeText,
                    borderRadius: 20,
                  }}
                >
                  <span>{colors.icon}</span>
                  <span>{paper.journal}</span>
                </span>
                {journalIF > 0 && (
                  <span className="text-xs" style={{ color: '#86868b' }}>
                    IF {journalIF.toFixed(1)}
                  </span>
                )}
              </div>

              {/* 제목 */}
              <p className="text-sm font-semibold leading-snug" style={{ color: '#1d1d1f' }}>
                {doiUrl ? (
                  <a
                    href={doiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-60 transition-opacity"
                  >
                    {paper.title}
                  </a>
                ) : paper.title}
              </p>

              {/* 저자 */}
              <p className="text-xs mt-0.5" style={{ color: '#86868b' }}>
                {paper.authors} · {paper.year}
              </p>

              {/* 반응 수 */}
              <div className="flex gap-3 mt-1.5 text-xs" style={{ color: '#86868b' }}>
                <span>🔥 {paper.paper_reaction_counts?.life_paper_count || 0}</span>
                <span>😭 {paper.paper_reaction_counts?.must_cite_count || 0}</span>
                <span>⭐ {paper.paper_reaction_counts?.avg_stars?.toFixed(1) || '−'}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
