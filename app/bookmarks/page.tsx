'use client'

import { useEffect, useState } from 'react'
import { supabase, JOURNAL_COLORS } from '@/lib/supabase'

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookmarks()
  }, [])

  async function loadBookmarks() {
    const { data } = await supabase
      .from('bookmarked_papers')
      .select('*')
      .order('created_at', { ascending: false })
    setBookmarks(data || [])
    setLoading(false)
  }

  async function unbookmark(bm: any) {
    await fetch('/api/bookmark', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bm.id }),
    })
    setBookmarks(prev => prev.filter(b => b.id !== bm.id))
  }

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-10 text-sm" style={{ color: '#86868b' }}>
        불러오는 중...
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-8">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#1d1d1f' }}>관심 논문</h1>
      <p className="text-sm mb-6" style={{ color: '#86868b' }}>
        {bookmarks.length}편 저장됨
      </p>

      {bookmarks.length === 0 ? (
        <p className="text-sm" style={{ color: '#86868b' }}>
          저장된 논문이 없습니다. 전체 탭에서 ☆ 관심 버튼을 눌러 추가하세요.
        </p>
      ) : (
        <div className="space-y-2">
          {bookmarks.map(bm => {
            const colors = JOURNAL_COLORS[bm.journal_tier as string] ?? JOURNAL_COLORS['applied']
            const doiUrl = bm.doi ? `https://doi.org/${bm.doi}` : null

            return (
              <div
                key={bm.id}
                className="p-4"
                style={{
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  borderRadius: 12,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5"
                        style={{ backgroundColor: colors.badgeBg, color: colors.badgeText, borderRadius: 20 }}
                      >
                        <span>{colors.icon}</span>
                        <span>{bm.journal}</span>
                      </span>
                    </div>

                    <p className="text-sm font-semibold leading-snug mb-0.5" style={{ color: '#1d1d1f' }}>
                      {doiUrl ? (
                        <a href={doiUrl} target="_blank" rel="noopener noreferrer"
                          className="hover:opacity-60 transition-opacity">
                          {bm.title}
                        </a>
                      ) : bm.title}
                    </p>

                    <p className="text-xs mb-2" style={{ color: '#86868b' }}>
                      {bm.authors} · {bm.year}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {(bm.matched_keywords || []).map((kw: string) => (
                        <span
                          key={kw}
                          className="text-xs px-1.5 py-0.5"
                          style={{ backgroundColor: '#f0f4ff', color: '#3b5bdb', borderRadius: 4 }}
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => unbookmark(bm)}
                    className="text-xs font-medium px-2.5 py-1 flex-shrink-0 transition-opacity hover:opacity-70"
                    style={{ backgroundColor: '#fff1f2', color: '#be123c', borderRadius: 6 }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
