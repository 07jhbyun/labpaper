'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SuggestPage() {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    await supabase.from('author_suggestions').insert({
      name: text.trim().slice(0, 100),
      reason: text.trim(),
    })
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="max-w-xl mx-auto px-5 py-20 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#1d1d1f' }}>제안이 접수됐습니다!</h2>
        <p className="text-sm mb-6" style={{ color: '#86868b' }}>검토 후 추가됩니다.</p>
        <button
          onClick={() => { setSubmitted(false); setText('') }}
          className="text-sm hover:underline"
          style={{ color: '#0071e3' }}
        >
          다른 제안하기
        </button>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-5 py-10">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#1d1d1f' }}>제안</h1>
      <p className="text-sm mb-6" style={{ color: '#86868b' }}>검토 후 추가됩니다.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="팔로우하면 좋을 연구자나 연구 키워드를 제안해주세요"
          rows={4}
          required
          style={{
            width: '100%',
            border: '1px solid #e5e5ea',
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 14,
            color: '#1d1d1f',
            backgroundColor: '#ffffff',
            outline: 'none',
            resize: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="w-full text-sm font-semibold py-2.5 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#1d1d1f', color: '#ffffff', borderRadius: 10 }}
        >
          {loading ? '제출 중...' : '제안하기'}
        </button>
      </form>
    </main>
  )
}
