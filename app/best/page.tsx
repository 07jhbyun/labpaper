import { supabaseAdmin, JOURNAL_COLORS, JOURNAL_IF_CLIENT_MAP } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// 점수 = 인생논문 + 나써야함 + 별점수 + 이게왜실림 + GPT썼냐 (뭔말이야 제외)
function calcScore(rc: any): number {
  return (
    (rc?.life_paper_count  || 0) +
    (rc?.must_cite_count   || 0) +
    (rc?.star_count        || 0) +
    (rc?.why_here_count    || 0) +
    (rc?.gpt_wrote_count   || 0)
  )
}

async function getBestPapers(period: 'month' | 'year', limit: number) {
  const now = new Date()
  const from = period === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), 0, 1)

  const { data: issues } = await supabaseAdmin
    .from('issues')
    .select('issue_number')
    .gte('published_at', from.toISOString().split('T')[0])

  if (!issues?.length) return []

  const issueNumbers = issues.map((i: any) => i.issue_number)

  const { data: papers } = await supabaseAdmin
    .from('papers')
    .select(`
      id, title, authors, journal, journal_tier, year, doi,
      paper_reaction_counts (
        life_paper_count, must_cite_count, why_here_count,
        gpt_wrote_count, what_the_count, avg_stars, star_count
      )
    `)
    .in('issue_number', issueNumbers)

  return (papers || [])
    .map((p: any) => ({ ...p, score: calcScore(p.paper_reaction_counts) }))
    .filter((p: any) => p.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit)
}

export default async function BestPage() {
  const [monthly, yearly] = await Promise.all([
    getBestPapers('month', 5),
    getBestPapers('year', 10),
  ])

  const now = new Date()
  const monthName = now.toLocaleDateString('ko-KR', { month: 'long' })
  const year = now.getFullYear()

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-8">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#1d1d1f' }}>베스트 논문</h1>

      <section className="mb-10">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: '#3a3a3c' }}>
          <span>🏆</span> {monthName} 베스트 Top 5
        </h2>
        <p className="text-xs mb-3" style={{ color: '#aeaeb2' }}>
          🔥 인생논문 · 😭 나써야함 · ⭐ 별점 · 🤔 이게왜실림 · 🤖 GPT썼냐 합산 (🤯 뭔말이야 제외)
        </p>
        <BestList papers={monthly} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: '#3a3a3c' }}>
          <span>🎖️</span> {year}년 베스트 Top 10
        </h2>
        <p className="text-xs mb-3" style={{ color: '#aeaeb2' }}>
          🔥 인생논문 · 😭 나써야함 · ⭐ 별점 · 🤔 이게왜실림 · 🤖 GPT썼냐 합산 (🤯 뭔말이야 제외)
        </p>
        <BestList papers={yearly} />
      </section>
    </main>
  )
}

const RANK_COLORS = ['#f59e0b', '#9ca3af', '#b45309']

function BestList({ papers }: { papers: any[] }) {
  if (!papers.length) {
    return (
      <p className="text-sm py-6" style={{ color: '#86868b' }}>
        아직 반응 데이터가 없습니다. 논문에 반응을 남겨보세요!
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {papers.map((paper, i) => {
        const colors = JOURNAL_COLORS[paper.journal_tier as string] ?? JOURNAL_COLORS['applied']
        const journalIF = JOURNAL_IF_CLIENT_MAP[paper.journal] || 0
        const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null
        const rc = paper.paper_reaction_counts

        return (
          <div
            key={paper.id}
            className="flex gap-3 items-start p-4"
            style={{
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: 12,
            }}
          >
            {/* 순위 */}
            <span
              className="text-base font-bold flex-shrink-0 w-6 text-center mt-0.5"
              style={{ color: RANK_COLORS[i] ?? '#c7c7cc' }}
            >
              {i + 1}
            </span>

            <div className="flex-1 min-w-0">
              {/* 저널 배지 + IF */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5"
                  style={{ backgroundColor: colors.badgeBg, color: colors.badgeText, borderRadius: 20 }}
                >
                  <span>{colors.icon}</span>
                  <span>{paper.journal}</span>
                </span>
                {journalIF > 0 && (
                  <span className="text-xs" style={{ color: '#86868b' }}>IF {journalIF.toFixed(1)}</span>
                )}
              </div>

              {/* 제목 */}
              <p className="text-sm font-semibold leading-snug" style={{ color: '#1d1d1f' }}>
                {doiUrl ? (
                  <a href={doiUrl} target="_blank" rel="noopener noreferrer"
                    className="hover:opacity-60 transition-opacity">
                    {paper.title}
                  </a>
                ) : paper.title}
              </p>

              {/* 저자 */}
              <p className="text-xs mt-0.5 mb-2" style={{ color: '#86868b' }}>
                {paper.authors} · {paper.year}
              </p>

              {/* 반응 카운트 + 점수 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: '#6e6e73' }}>
                {(rc?.life_paper_count  || 0) > 0 && <span>🔥 {rc.life_paper_count}</span>}
                {(rc?.must_cite_count   || 0) > 0 && <span>😭 {rc.must_cite_count}</span>}
                {(rc?.why_here_count    || 0) > 0 && <span>🤔 {rc.why_here_count}</span>}
                {(rc?.gpt_wrote_count   || 0) > 0 && <span>🤖 {rc.gpt_wrote_count}</span>}
                {(rc?.what_the_count   || 0) > 0 && (
                  <span style={{ color: '#aeaeb2' }}>🤯 {rc.what_the_count}</span>
                )}
                {(rc?.star_count || 0) > 0 && (
                  <span>⭐ {Number(rc.avg_stars).toFixed(1)} ({rc.star_count}명)</span>
                )}
                <span
                  className="ml-auto font-semibold"
                  style={{ color: '#0071e3' }}
                >
                  {paper.score}점
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
