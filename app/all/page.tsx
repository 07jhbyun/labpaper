'use client'

import { useEffect, useState } from 'react'
import { supabase, JOURNAL_COLORS } from '@/lib/supabase'
import PageViewTracker from '@/components/PageViewTracker'

const PAGE_SIZE = 20

export default function AllPage() {
  const [papers, setPapers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [bookmarkedKeys, setBookmarkedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPapers()
    loadBookmarks()
  }, [])

  async function loadPapers() {
    const { data: latestIssue } = await supabase
      .from('issues')
      .select('issue_number')
      .order('issue_number', { ascending: false })
      .limit(1)
      .single()

    if (!latestIssue) { setLoading(false); return }

    const { data } = await supabase
      .from('all_papers')
      .select('*')
      .eq('issue_number', latestIssue.issue_number)
      .order('created_at', { ascending: false })

    setPapers(data || [])
    setLoading(false)
  }

  async function loadBookmarks() {
    const { data } = await supabase.from('bookmarked_papers').select('doi, title')
    const set = new Set<string>()
    for (const b of data || []) {
      set.add(b.doi || b.title)
    }
    setBookmarkedKeys(set)
  }

  function isBookmarked(paper: any) {
    return bookmarkedKeys.has(paper.doi || paper.title)
  }

  async function toggleBookmark(paper: any) {
    const key = paper.doi || paper.title
    if (isBookmarked(paper)) {
      let q = supabase.from('bookmarked_papers').select('id')
      if (paper.doi) q = q.eq('doi', paper.doi)
      else q = q.eq('title', paper.title)
      const { data } = await q.maybeSingle()
      if (data) {
        await fetch('/api/bookmark', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id }),
        })
        setBookmarkedKeys(prev => { const s = new Set(prev); s.delete(key); return s })
      }
    } else {
      await fetch('/api/bookmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paper.title,
          authors: paper.authors,
          journal: paper.journal,
          journal_tier: paper.journal_tier,
          year: paper.year,
          doi: paper.doi,
          matched_keywords: paper.matched_keywords,
          issue_number: paper.issue_number,
        }),
      })
      setBookmarkedKeys(prev => new Set([...prev, key]))
    }
  }

  const paged = papers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(papers.length / PAGE_SIZE)

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-10 text-sm" style={{ color: '#86868b' }}>
        불러오는 중...
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-8">
      <PageViewTracker page="all" />
      <h1 className="text-xl font-bold mb-1" style={{ color: '#1d1d1f' }}>전체 논문</h1>
      <p className="text-sm mb-6" style={{ color: '#86868b' }}>
        이번 호 키워드 필터 통과 논문 {papers.length}편
      </p>

      {papers.length === 0 ? (
        <p className="text-sm" style={{ color: '#86868b' }}>아직 수집된 논문이 없습니다.</p>
      ) : (
        <>
          <div className="space-y-2">
            {paged.map(paper => {
              const colors = JOURNAL_COLORS[paper.journal_tier as string] ?? JOURNAL_COLORS['applied']
              const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null
              const bm = isBookmarked(paper)

              return (
                <div
                  key={paper.id}
                  className="p-4"
                  style={{
                    backgroundColor: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    borderRadius: 12,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5"
                      style={{ backgroundColor: colors.badgeBg, color: colors.badgeText, borderRadius: 20 }}
                    >
                      <span>{colors.icon}</span>
                      <span>{paper.journal}</span>
                    </span>
                  </div>

                  <p className="text-sm font-semibold leading-snug mb-0.5" style={{ color: '#1d1d1f' }}>
                    {doiUrl ? (
                      <a href={doiUrl} target="_blank" rel="noopener noreferrer"
                        className="hover:opacity-60 transition-opacity">
                        {paper.title}
                      </a>
                    ) : paper.title}
                  </p>

                  <p className="text-xs mb-2.5" style={{ color: '#86868b' }}>
                    {paper.authors} · {paper.year}
                  </p>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1">
                      {(paper.matched_keywords || []).map((kw: string) => (
                        <span
                          key={kw}
                          className="text-xs px-1.5 py-0.5"
                          style={{ backgroundColor: '#f0f4ff', color: '#3b5bdb', borderRadius: 4 }}
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => toggleBookmark(paper)}
                      className="text-xs font-medium px-2.5 py-1 flex-shrink-0 transition-opacity hover:opacity-70"
                      style={{
                        backgroundColor: bm ? '#1d1d1f' : '#f5f5f7',
                        color: bm ? '#ffffff' : '#3a3a3c',
                        borderRadius: 6,
                      }}
                    >
                      {bm ? '★ 관심' : '☆ 관심'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-xs px-3 py-1.5 transition-opacity disabled:opacity-30"
                style={{ backgroundColor: '#f5f5f7', borderRadius: 6, color: '#3a3a3c' }}
              >
                이전
              </button>
              <span className="text-xs" style={{ color: '#86868b' }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="text-xs px-3 py-1.5 transition-opacity disabled:opacity-30"
                style={{ backgroundColor: '#f5f5f7', borderRadius: 6, color: '#3a3a3c' }}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
