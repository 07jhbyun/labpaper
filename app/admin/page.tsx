'use client'

import { useState } from 'react'
import { supabaseAdmin } from '@/lib/supabase'

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

const sectionStyle = {
  backgroundColor: '#ffffff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  borderRadius: 12,
  padding: 20,
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [collecting, setCollecting] = useState(false)
  const [collectResult, setCollectResult] = useState('')
  const [manualPaper, setManualPaper] = useState({
    title: '', authors: '', journal: '', year: new Date().getFullYear(), doi: '',
  })
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [newSub, setNewSub] = useState({ email: '', name: '' })
  const [notifyResult, setNotifyResult] = useState('')
  const [sendingNotify, setSendingNotify] = useState(false)

  function checkPassword() {
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setAuthed(true)
      loadSuggestions()
      loadSubscribers()
    } else {
      alert('비밀번호가 틀렸습니다')
    }
  }

  async function loadSuggestions() {
    const { data } = await supabaseAdmin
      .from('author_suggestions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setSuggestions(data || [])
  }

  async function approveSuggestion(id: string, name: string) {
    await supabaseAdmin.from('followed_authors').insert({ name, status: 'active', suggested_by: 'student' })
    await supabaseAdmin.from('author_suggestions').update({ status: 'approved' }).eq('id', id)
    loadSuggestions()
  }

  async function loadSubscribers() {
    const { data } = await supabaseAdmin
      .from('subscribers')
      .select('*')
      .order('created_at', { ascending: false })
    setSubscribers(data || [])
  }

  async function addSubscriber() {
    if (!newSub.email.trim()) return
    await supabaseAdmin.from('subscribers').insert({
      email: newSub.email.trim(),
      name: newSub.name.trim(),
    })
    setNewSub({ email: '', name: '' })
    loadSubscribers()
  }

  async function removeSubscriber(id: string) {
    await supabaseAdmin.from('subscribers').delete().eq('id', id)
    loadSubscribers()
  }

  async function sendTestEmail() {
    setSendingNotify(true)
    setNotifyResult('')
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`,
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      setNotifyResult(data.success
        ? `✅ ${data.sent}명에게 발송 완료`
        : `❌ 오류: ${data.error}`)
    } catch {
      setNotifyResult('❌ 네트워크 오류')
    }
    setSendingNotify(false)
  }

  async function rejectSuggestion(id: string) {
    await supabaseAdmin.from('author_suggestions').update({ status: 'rejected' }).eq('id', id)
    loadSuggestions()
  }

  async function triggerCollect() {
    setCollecting(true)
    setCollectResult('')
    try {
      const res = await fetch('/api/papers/collect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}` },
      })
      // 202: Netlify 백그라운드 함수 (1-2분 소요)
      if (res.status === 202) {
        setCollectResult('🔄 수집을 시작했습니다. 완료까지 1~2분 소요됩니다. 잠시 후 새로고침해주세요.')
        setCollecting(false)
        return
      }
      const data = await res.json()
      setCollectResult(data.success
        ? `✅ Vol.${data.issue_number} 생성 완료 — 논문 ${data.papers_collected}편`
        : `❌ 오류: ${data.error}`)
    } catch {
      setCollectResult('❌ 네트워크 오류')
    }
    setCollecting(false)
  }

  async function addManualPaper() {
    const { data: lastIssue } = await supabaseAdmin
      .from('issues')
      .select('issue_number')
      .order('issue_number', { ascending: false })
      .limit(1)
      .single()

    await supabaseAdmin.from('papers').insert({
      ...manualPaper,
      issue_number: lastIssue?.issue_number || 1,
      journal_tier: 'applied',
      summary_bullets: [],
      source: 'manual',
    })
    setManualPaper({ title: '', authors: '', journal: '', year: new Date().getFullYear(), doi: '' })
    alert('논문이 추가됐습니다')
  }

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto px-5 py-24 text-center">
        <h1 className="text-lg font-semibold mb-5" style={{ color: '#1d1d1f' }}>관리자 로그인</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && checkPassword()}
          placeholder="비밀번호"
          style={{ ...inputStyle, marginBottom: 10 }}
        />
        <button
          onClick={checkPassword}
          className="w-full text-sm font-semibold py-2.5 transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#1d1d1f', color: '#ffffff', borderRadius: 10 }}
        >
          로그인
        </button>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-5">
      <h1 className="text-xl font-bold" style={{ color: '#1d1d1f' }}>관리자</h1>

      {/* 논문 자동 수집 */}
      <section style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#3a3a3c' }}>논문 자동 수집</h2>
        <button
          onClick={triggerCollect}
          disabled={collecting}
          className="text-sm font-medium px-4 py-2 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#0071e3', color: '#ffffff', borderRadius: 8 }}
        >
          {collecting ? '수집 중...' : '지금 수집하기'}
        </button>
        {collectResult && (
          <p className="text-sm mt-3" style={{ color: '#3a3a3c' }}>{collectResult}</p>
        )}
      </section>

      {/* 논문 수동 추가 */}
      <section style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#3a3a3c' }}>논문 수동 추가</h2>
        <div className="space-y-2">
          {[
            { key: 'title',   label: '제목',  placeholder: '논문 제목' },
            { key: 'authors', label: '저자',  placeholder: '저자들' },
            { key: 'journal', label: '저널',  placeholder: '저널명' },
            { key: 'doi',     label: 'DOI',   placeholder: '10.xxxx/...' },
          ].map(({ key, label, placeholder }) => (
            <input
              key={key}
              type="text"
              placeholder={`${label}: ${placeholder}`}
              value={(manualPaper as any)[key]}
              onChange={e => setManualPaper(prev => ({ ...prev, [key]: e.target.value }))}
              style={inputStyle}
            />
          ))}
          <button
            onClick={addManualPaper}
            className="text-sm font-medium px-4 py-2 transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#1d1d1f', color: '#ffffff', borderRadius: 8 }}
          >
            추가
          </button>
        </div>
      </section>

      {/* 구독자 관리 */}
      <section style={sectionStyle}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#3a3a3c' }}>
            이메일 구독자 ({subscribers.filter(s => s.active).length}명 활성)
          </h2>
          <div className="flex items-center gap-2">
            {notifyResult && (
              <span className="text-xs" style={{ color: '#3a3a3c' }}>{notifyResult}</span>
            )}
            <button
              onClick={sendTestEmail}
              disabled={sendingNotify}
              className="text-xs font-medium px-3 py-1.5 transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: 8 }}
            >
              {sendingNotify ? '발송 중...' : '테스트 메일 발송'}
            </button>
          </div>
        </div>

        {/* 구독자 추가 */}
        <div className="flex gap-2 mb-4">
          <input
            type="email"
            placeholder="이메일"
            value={newSub.email}
            onChange={e => setNewSub(prev => ({ ...prev, email: e.target.value }))}
            style={{ ...inputStyle, width: 'auto', flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addSubscriber()}
          />
          <input
            type="text"
            placeholder="이름 (선택)"
            value={newSub.name}
            onChange={e => setNewSub(prev => ({ ...prev, name: e.target.value }))}
            style={{ ...inputStyle, width: 'auto', flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addSubscriber()}
          />
          <button
            onClick={addSubscriber}
            disabled={!newSub.email.trim()}
            className="text-sm font-medium px-4 py-2 transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: '#0071e3', color: '#ffffff', borderRadius: 8 }}
          >
            추가
          </button>
        </div>

        {/* 구독자 목록 */}
        {subscribers.length === 0 ? (
          <p className="text-sm" style={{ color: '#86868b' }}>구독자가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {subscribers.map(sub => (
              <div
                key={sub.id}
                className="flex items-center justify-between px-3 py-2"
                style={{ backgroundColor: '#f5f5f7', borderRadius: 8 }}
              >
                <div>
                  <span className="text-sm font-medium" style={{ color: '#1d1d1f' }}>
                    {sub.name || '—'}
                  </span>
                  <span className="text-xs ml-2" style={{ color: '#86868b' }}>{sub.email}</span>
                </div>
                <button
                  onClick={() => removeSubscriber(sub.id)}
                  className="text-xs transition-opacity hover:opacity-60"
                  style={{ color: '#be123c' }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 저자 제안 승인 */}
      <section style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#3a3a3c' }}>
          저자 제안 대기 중 ({suggestions.length})
        </h2>
        {suggestions.length === 0 ? (
          <p className="text-sm" style={{ color: '#86868b' }}>대기 중인 제안이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {suggestions.map(s => (
              <div
                key={s.id}
                className="p-3"
                style={{ backgroundColor: '#f5f5f7', borderRadius: 10 }}
              >
                <p className="text-sm font-semibold" style={{ color: '#1d1d1f' }}>{s.name}</p>
                {s.scholar_url && (
                  <a
                    href={s.scholar_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline"
                    style={{ color: '#0071e3' }}
                  >
                    {s.scholar_url}
                  </a>
                )}
                {s.reason && (
                  <p className="text-xs mt-1" style={{ color: '#6e6e73' }}>{s.reason}</p>
                )}
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => approveSuggestion(s.id, s.name)}
                    className="text-xs font-medium px-3 py-1 transition-opacity hover:opacity-70"
                    style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: 6 }}
                  >
                    승인
                  </button>
                  <button
                    onClick={() => rejectSuggestion(s.id)}
                    className="text-xs font-medium px-3 py-1 transition-opacity hover:opacity-70"
                    style={{ backgroundColor: '#fff1f2', color: '#be123c', borderRadius: 6 }}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
