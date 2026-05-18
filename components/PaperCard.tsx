'use client'

import { useState, useEffect } from 'react'
import {
  supabase,
  getSessionId,
  getSessionScientist,
  JOURNAL_COLORS,
  JOURNAL_ABBR_MAP,
  JOURNAL_IF_CLIENT_MAP,
} from '@/lib/supabase'
import type { Paper, ReactionType } from '@/lib/supabase'

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'why_here',   emoji: '🤔', label: '이게 왜 실림?' },
  { type: 'life_paper', emoji: '🔥', label: '인생논문' },
  { type: 'must_cite',  emoji: '😭', label: '나 이거 써야함' },
  { type: 'gpt_wrote',  emoji: '🤖', label: 'GPT가 썼냐' },
  { type: 'what_the',   emoji: '🤯', label: '뭔 말이야?' },
]

interface ReactionState {
  why_here_count: number
  life_paper_count: number
  must_cite_count: number
  gpt_wrote_count: number
  what_the_count: number
  avg_stars: number
  star_count: number
}

export default function PaperCard({ paper }: { paper: Paper }) {
  const [myReactions, setMyReactions] = useState<Set<ReactionType>>(new Set())
  const [myStar, setMyStar] = useState(0)
  const [hoverStar, setHoverStar] = useState(0)
  const [counts, setCounts] = useState<ReactionState>({
    why_here_count: 0, life_paper_count: 0,
    must_cite_count: 0, gpt_wrote_count: 0,
    what_the_count: 0, avg_stars: 0, star_count: 0,
  })
  const [scientist, setScientist] = useState('아인슈타인')
  const [sessionId, setSessionId] = useState('')
  const [imgSrc, setImgSrc] = useState<string | null>(paper.image_url || null)

  useEffect(() => {
    setScientist(getSessionScientist())
    const sid = getSessionId()
    setSessionId(sid)
    loadReactions(sid)
  }, [paper.id])

  // DOI 있으면 Semantic Scholar TOC 이미지 시도
  useEffect(() => {
    if (imgSrc || !paper.doi) return
    fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${paper.doi}?fields=figures`)
      .then(r => r.json())
      .then(data => {
        const url = data.figures?.[0]?.imageUrls?.[0]
        if (url) setImgSrc(url)
      })
      .catch(() => {})
  }, [paper.doi])

  async function loadReactions(sid: string) {
    const { data: countData } = await supabase
      .from('paper_reaction_counts')
      .select('*')
      .eq('paper_id', paper.id)
      .single()

    if (countData) setCounts(countData as ReactionState)

    const { data: myData } = await supabase
      .from('reactions')
      .select('reaction_type, star_value')
      .eq('paper_id', paper.id)
      .eq('session_id', sid)

    if (myData) {
      const types = new Set(myData.map((r: any) => r.reaction_type as ReactionType))
      setMyReactions(types)
      const star = myData.find((r: any) => r.reaction_type === 'star')
      if (star?.star_value) setMyStar(star.star_value)
    }
  }

  async function toggleReaction(type: ReactionType) {
    const isActive = myReactions.has(type)
    const newSet = new Set(myReactions)

    if (isActive) {
      newSet.delete(type)
      await supabase.from('reactions')
        .delete()
        .eq('paper_id', paper.id)
        .eq('session_id', sessionId)
        .eq('reaction_type', type)
    } else {
      newSet.add(type)
      await supabase.from('reactions')
        .upsert({ paper_id: paper.id, session_id: sessionId, reaction_type: type })
    }

    setMyReactions(newSet)
    const countKey = `${type}_count` as keyof ReactionState
    setCounts(prev => ({
      ...prev,
      [countKey]: Math.max(0, (prev[countKey] as number) + (isActive ? -1 : 1)),
    }))
  }

  async function rateStar(value: number) {
    setMyStar(value)
    await supabase.from('reactions')
      .upsert(
        { paper_id: paper.id, session_id: sessionId, reaction_type: 'star', star_value: value },
        { onConflict: 'paper_id,session_id,reaction_type' }
      )
    await loadReactions(sessionId)
  }

  const colors = JOURNAL_COLORS[paper.journal_tier] ?? JOURNAL_COLORS['applied']
  const journalIF = JOURNAL_IF_CLIENT_MAP[paper.journal] || 0
  const abbr = JOURNAL_ABBR_MAP[paper.journal] || paper.journal
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null

  return (
    <article
      className="p-4 sm:p-5"
      style={{
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        borderRadius: 12,
      }}
    >
      {/* 저널 배지 + IF */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1"
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
      <h2 className="text-[15px] font-semibold leading-snug mb-0.5" style={{ color: '#1d1d1f' }}>
        {doiUrl ? (
          <a href={doiUrl} target="_blank" rel="noopener noreferrer"
            className="hover:opacity-60 transition-opacity">
            {paper.title}
          </a>
        ) : paper.title}
      </h2>

      {/* 한국어 번역 제목 */}
      {paper.title_ko && (
        <p className="text-[13px] mb-1" style={{ color: '#6e6e73' }}>{paper.title_ko}</p>
      )}

      {/* 저자 */}
      <p className="text-xs mt-1" style={{ color: '#86868b' }}>
        {paper.authors} · {paper.year}
      </p>

      {/* 소속 (1저자 / 교신저자) */}
      {(paper.affiliations?.first?.affiliation || paper.affiliations?.corresponding?.affiliation) && (
        <p className="text-[11px] mt-0.5 mb-4 leading-relaxed" style={{ color: '#aeaeb2' }}>
          {paper.affiliations.first?.affiliation && (
            <span>{paper.affiliations.first.name}: {paper.affiliations.first.affiliation}</span>
          )}
          {paper.affiliations.corresponding &&
            paper.affiliations.corresponding.name !== paper.affiliations.first?.name &&
            paper.affiliations.corresponding.affiliation && (
              <span> · {paper.affiliations.corresponding.name}: {paper.affiliations.corresponding.affiliation}</span>
          )}
        </p>
      )}
      {!paper.affiliations?.first?.affiliation && !paper.affiliations?.corresponding?.affiliation && (
        <div className="mb-4" />
      )}

      {/* TOC 이미지 + 핵심 결과 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* TOC 영역: 모바일 full-width / 데스크톱 120×90 */}
        <div
          className="overflow-hidden rounded-lg w-full sm:w-[120px] h-36 sm:h-[90px] sm:flex-shrink-0"
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt="TOC"
              className="w-full h-full object-cover"
              onError={() => setImgSrc(null)}
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-1"
              style={{ background: colors.gradient }}
            >
              <span className="text-xl leading-none">{colors.icon}</span>
              <span
                className="text-[10px] font-semibold text-center leading-tight px-1"
                style={{ color: colors.badgeText }}
              >
                {abbr}
              </span>
            </div>
          )}
        </div>

        {/* 핵심 결과 bullets */}
        {(() => {
          const goodBullets = paper.summary_bullets.filter(
            b => b && !b.includes('확인하세요') && !b.includes('오류')
          )
          if (goodBullets.length >= 2) {
            return (
              <ul className="flex-1 space-y-1.5">
                {goodBullets.map((bullet, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug">
                    <span className="flex-shrink-0" style={{ color: '#c7c7cc' }}>•</span>
                    <span style={{ color: '#3a3a3c' }}>{bullet}</span>
                  </li>
                ))}
              </ul>
            )
          }
          if (paper.abstract) {
            return (
              <p className="flex-1 text-[13px] leading-relaxed" style={{ color: '#3a3a3c' }}>
                {paper.abstract.slice(0, 300)}{paper.abstract.length > 300 ? '…' : ''}
              </p>
            )
          }
          return (
            <p className="flex-1 text-[13px]" style={{ color: '#aeaeb2' }}>
              Abstract를 불러올 수 없습니다
            </p>
          )
        })()}
      </div>

      {/* 관련 논문 */}
      {paper.related_papers?.length > 0 && (
        <div className="text-xs mb-4" style={{ color: '#86868b' }}>
          <span className="mr-1">🔗 관련:</span>
          {paper.related_papers.slice(0, 2).map((rp: any, i: number, arr) => (
            <span key={i}>
              {rp.doi ? (
                <a
                  href={`https://doi.org/${rp.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: '#0071e3' }}
                >
                  {rp.title} ({rp.journal}, {rp.year})
                </a>
              ) : (
                <span>{rp.title} ({rp.journal}, {rp.year})</span>
              )}
              {i < arr.length - 1 && <span className="mx-1">·</span>}
            </span>
          ))}
        </div>
      )}

      <hr style={{ borderColor: '#f2f2f7', margin: '0 0 12px' }} />

      {/* 반응 버튼 */}
      <div className="flex items-center gap-2 flex-wrap">
        {REACTIONS.map(({ type, emoji, label }) => {
          const countKey = `${type}_count` as keyof ReactionState
          const count = counts[countKey] as number
          const active = myReactions.has(type)
          return (
            <button
              key={type}
              onClick={() => toggleReaction(type)}
              className="flex items-center gap-1.5 text-xs px-3 rounded-full transition-all"
              style={{
                backgroundColor: active ? '#e8f0fe' : '#f5f5f7',
                color: active ? '#1a73e8' : '#6e6e73',
                border: `1px solid ${active ? '#c5d8fd' : 'transparent'}`,
                minHeight: 44,
              }}
            >
              <span>{emoji}</span>
              <span>{label}</span>
              {count > 0 && (
                <span className="font-semibold" style={{ color: active ? '#1a73e8' : '#3a3a3c' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* 별점 */}
        <div className="ml-auto flex items-center" style={{ minHeight: 44 }}>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => rateStar(v)}
                onMouseEnter={() => setHoverStar(v)}
                onMouseLeave={() => setHoverStar(0)}
                className="text-xl transition-colors p-1"
                style={{ color: v <= (hoverStar || myStar) ? '#ff9f0a' : '#e5e5ea' }}
              >
                ★
              </button>
            ))}
            {counts.avg_stars > 0 && (
              <span className="text-xs ml-1" style={{ color: '#86868b' }}>
                {Number(counts.avg_stars).toFixed(1)} ({counts.star_count})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 익명 라벨 */}
      <p className="text-[11px] mt-2 text-right" style={{ color: '#c7c7cc' }}>
        {scientist}(으)로 참여 중
      </p>
    </article>
  )
}
