'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle = {
  width: '100%',
  border: '1px solid #e5e5ea',
  borderRadius: 10,
  padding: '9px 12px',
  fontSize: 14,
  color: '#1d1d1f',
  backgroundColor: '#ffffff',
  outline: 'none',
}

export default function SuggestPage() {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    const { error } = await supabase.from('author_suggestions').insert({
      name: name.trim(),
      scholar_url: url.trim() || null,
      reason: reason.trim() || null,
    })

    setLoading(false)
    if (!error) setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="max-w-xl mx-auto px-5 py-20 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#1d1d1f' }}>
          제안이 접수됐습니다!
        </h2>
        <p className="text-sm" style={{ color: '#86868b' }}>
          교수님 검토 후 팔로우 목록에 추가됩니다.
        </p>
        <button
          onClick={() => { setSubmitted(false); setName(''); setUrl(''); setReason('') }}
          className="mt-6 text-sm hover:underline"
          style={{ color: '#0071e3' }}
        >
          다른 저자 제안하기
        </button>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#1d1d1f' }}>저자 제안</h1>
      <p className="text-sm mb-6" style={{ color: '#86868b' }}>
        팔로우하면 좋을 연구자를 익명으로 제안해주세요. 교수님이 검토 후 추가합니다.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#3a3a3c' }}>
            저자 이름 <span style={{ color: '#ff3b30' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: Markus Antonietti"
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#3a3a3c' }}>
            Google Scholar URL <span style={{ color: '#86868b' }}>(선택)</span>
          </label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://scholar.google.com/..."
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#3a3a3c' }}>
            추천 이유 <span style={{ color: '#86868b' }}>(선택)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="왜 이 분을 팔로우하면 좋을지 간단히 적어주세요"
            rows={3}
            style={{ ...inputStyle, resize: 'none' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full text-sm font-semibold py-2.5 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#1d1d1f', color: '#ffffff', borderRadius: 10 }}
        >
          {loading ? '제출 중...' : '익명으로 제안하기'}
        </button>
      </form>

      <p className="text-xs mt-4 text-center" style={{ color: '#c7c7cc' }}>
        완전 익명입니다. 이름이나 학번은 저장되지 않습니다.
      </p>
    </main>
  )
}
