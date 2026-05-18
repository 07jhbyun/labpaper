'use client'

import { useState } from 'react'
import type { Horoscope } from '@/lib/supabase'

const HOROSCOPE_ITEMS = [
  { key: 'reviewer_luck',   emoji: '💬', label: '이번 주 한 줄 평' },
  { key: 'paper_luck',      emoji: '🔬', label: '이번 주 분위기' },
  { key: 'experiment_luck', emoji: '😮', label: '황당한 포인트' },
  { key: 'citation_luck',   emoji: '🥲', label: '대학원생 공감' },
]

export default function HoroscopeCard({ horoscope }: { horoscope: Horoscope }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        backgroundColor: '#fffbeb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        borderRadius: 12,
        padding: 20,
        marginTop: 16,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🧪</span>
          <span className="text-sm font-semibold" style={{ color: '#92400e' }}>
            이번 주 논문 요약
          </span>
        </div>
        <span className="text-xs" style={{ color: '#d97706' }}>
          {expanded ? '접기 ▲' : '펼치기 ▼'}
        </span>
      </button>

      {/* reviewer_luck은 항상 표시 */}
      <p className="text-sm leading-relaxed mt-3" style={{ color: '#b45309' }}>
        {horoscope.reviewer_luck}
      </p>

      {expanded && (
        <div
          className="mt-3 space-y-3 pt-3"
          style={{ borderTop: '1px solid rgba(217,119,6,0.15)' }}
        >
          {HOROSCOPE_ITEMS.slice(1).map(({ key, emoji, label }) => (
            <div key={key} className="flex gap-2.5">
              <span className="text-sm flex-shrink-0 mt-0.5">{emoji}</span>
              <div>
                <span className="text-xs font-semibold" style={{ color: '#d97706' }}>
                  {label}
                </span>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: '#b45309' }}>
                  {horoscope[key as keyof Horoscope]}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
