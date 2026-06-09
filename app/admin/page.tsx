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
  const [autoAuthors, setAutoAuthors] = useState<any[]>([])
  const [autoKeywords, setAutoKeywords] = useState<any[]>([])
  const [stats, setStats] = useState<{
    total: number
    today: number
    week: number
    byPage: Record<string, number>
    daily: { date: string; count: number }[]
  } | null>(null)

  function checkPassword() {
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setAuthed(true)
      loadSuggestions()
      loadSubscribers()
      loadAutoAuthors()
      loadAutoKeywords()
      loadStats()
    } else {
      alert('비밀번호가 틀렸습니다')
    }
  }

  async function loadAutoAuthors() {
    const { data } = await supabaseAdmin
      .from('followed_authors')
      .select('*')
      .eq('status', 'auto_added')
      .order('created_at', { ascending: false })
    setAutoAuthors(data || [])
  }

  async function loadStats() {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const days7Start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    days7Start.setHours(0, 0, 0, 0)

    const [totalRes, todayRes, weekRes, byPageRes, dailyRes] = await Promise.all([
      supabaseAdmin.from('page_views').select('session_id', { count: 'exact', head: false }),
      supabaseAdmin.from('page_views').select('session_id').gte('visited_at', todayStart),
      supabaseAdmin.from('page_views').select('session_id').gte('visited_at', weekStart),
      supabaseAdmin.from('page_views').select('page, session_id'),
      supabaseAdmin.from('page_views').select('visited_at, session_id').gte('visited_at', days7Start.toISOString()),
    ])

    // 고유 세션 수 집계
    const unique = (rows: any[] | null) =>
      new Set((rows || []).map((r: any) => r.session_id)).size

    // 페이지별 고유 세션
    const byPage: Record<string, number> = {}
    for (const row of byPageRes.data || []) {
      if (!byPage[row.page]) byPage[row.page] = 0
    }
    const pageGroups: Record<string, Set<string>> = {}
    for (const row of byPageRes.data || []) {
      if (!pageGroups[row.page]) pageGroups[row.page] = new Set()
      pageGroups[row.page].add(row.session_id)
    }
    for (const [page, sessions] of Object.entries(pageGroups)) {
      byPage[page] = sessions.size
    }

    // 일별 고유 세션 (최근 7일)
    const dailyGroups: Record<string, Set<string>> = {}
    for (const row of dailyRes.data || []) {
      const date = row.visited_at.slice(0, 10)
      if (!dailyGroups[date]) dailyGroups[date] = new Set()
      dailyGroups[date].add(row.session_id)
    }
    const daily = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(days7Start)
      d.setDate(d.getDate() + i)
      const date = d.toISOString().slice(0, 10)
      return { date, count: dailyGroups[date]?.size || 0 }
    })

    setStats({
      total: unique(totalRes.data),
      today: unique(todayRes.data),
      week: unique(weekRes.data),
      byPage,
      daily,
    })
  }

  async function loadAutoKeywords() {
    const { data } = await supabaseAdmin
      .from('keywords')
      .select('*')
      .eq('source', 'auto_added')
      .order('created_at', { ascending: false })
    setAutoKeywords(data || [])
  }

  async function promoteAutoAuthor(id: string) {
    await supabaseAdmin.from('followed_authors').update({ status: 'active' }).eq('id', id)
    loadAutoAuthors()
  }

  async function deleteAutoAuthor(id: string) {
    await supabaseAdmin.from('followed_authors').delete().eq('id', id)
    loadAutoAuthors()
  }

  async function deleteAutoKeyword(id: string) {
    await supabaseAdmin.from('keywords').delete().eq('id', id)
    loadAutoKeywords()
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
      const res = await fetch('/.netlify/functions/collect-background', {
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
    <main className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-8 space-y-5">
      <h1 className="text-xl font-bold" style={{ color: '#1d1d1f' }}>관리자</h1>

      {/* 방문자 통계 */}
      <section style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: '#3a3a3c' }}>방문자 통계</h2>
        {!stats ? (
          <p className="text-sm" style={{ color: '#86868b' }}>로딩 중...</p>
        ) : (
          <div className="space-y-5">
            {/* 요약 숫자 */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '오늘', value: stats.today },
                { label: '최근 7일', value: stats.week },
                { label: '누적', value: stats.total },
              ].map(({ label, value }) => (
                <div key={label} className="text-center py-3 rounded-xl"
                  style={{ backgroundColor: '#f5f5f7' }}>
                  <p className="text-2xl font-bold" style={{ color: '#1d1d1f' }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#86868b' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* 페이지별 */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#6e6e73' }}>페이지별 방문 (고유 세션)</p>
              <div className="space-y-1.5">
                {([
                  { key: 'home', label: '메인 (/)' },
                  { key: 'all', label: '전체 논문' },
                  { key: 'bookmarks', label: '관심 논문' },
                  { key: 'best', label: '베스트' },
                ] as { key: string; label: string }[]).map(({ key, label }) => {
                  const count = stats.byPage[key] || 0
                  const max = Math.max(...Object.values(stats.byPage), 1)
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs w-24 flex-shrink-0" style={{ color: '#3a3a3c' }}>{label}</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ backgroundColor: '#f5f5f7', height: 6 }}>
                        <div className="h-full rounded-full" style={{
                          width: `${(count / max) * 100}%`,
                          backgroundColor: '#0071e3',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span className="text-xs w-6 text-right" style={{ color: '#86868b' }}>{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 7일 일별 바 차트 */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#6e6e73' }}>최근 7일 일별 방문자</p>
              <div className="flex items-end gap-1.5" style={{ height: 60 }}>
                {stats.daily.map(({ date, count }) => {
                  const max = Math.max(...stats.daily.map(d => d.count), 1)
                  const heightPct = (count / max) * 100
                  const label = new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
                  return (
                    <div key={date} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-xs" style={{ color: '#86868b', fontSize: 10 }}>{count || ''}</span>
                      <div className="w-full rounded-t" style={{
                        height: `${Math.max(heightPct, count > 0 ? 8 : 2)}%`,
                        minHeight: 2,
                        backgroundColor: count > 0 ? '#0071e3' : '#e5e5ea',
                        transition: 'height 0.4s ease',
                      }} />
                      <span style={{ color: '#aeaeb2', fontSize: 9, whiteSpace: 'nowrap' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

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

      {/* 자동 추가된 저자 */}
      <section style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#3a3a3c' }}>
          자동 추가된 저자 ({autoAuthors.length})
        </h2>
        <p className="text-xs mb-3" style={{ color: '#aeaeb2' }}>관심 버튼으로 자동 추가됨. 승인하면 다음 수집부터 팔로우합니다.</p>
        {autoAuthors.length === 0 ? (
          <p className="text-sm" style={{ color: '#86868b' }}>자동 추가된 저자가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {autoAuthors.map(a => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2"
                style={{ backgroundColor: '#f5f5f7', borderRadius: 8 }}>
                <span className="text-sm" style={{ color: '#1d1d1f' }}>{a.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => promoteAutoAuthor(a.id)}
                    className="text-xs font-medium px-3 py-1 transition-opacity hover:opacity-70"
                    style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: 6 }}>
                    팔로우 승인
                  </button>
                  <button onClick={() => deleteAutoAuthor(a.id)}
                    className="text-xs transition-opacity hover:opacity-60"
                    style={{ color: '#be123c' }}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 자동 추가된 키워드 */}
      <section style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#3a3a3c' }}>
          자동 추가된 키워드 ({autoKeywords.length})
        </h2>
        <p className="text-xs mb-3" style={{ color: '#aeaeb2' }}>관심 버튼으로 자동 추가됨. 다음 수집부터 추가 필터로 사용됩니다.</p>
        {autoKeywords.length === 0 ? (
          <p className="text-sm" style={{ color: '#86868b' }}>자동 추가된 키워드가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {autoKeywords.map(k => (
              <div key={k.id} className="flex items-center gap-1.5 px-2.5 py-1"
                style={{ backgroundColor: '#f0f4ff', borderRadius: 6 }}>
                <span className="text-xs" style={{ color: '#3b5bdb' }}>#{k.keyword}</span>
                <button onClick={() => deleteAutoKeyword(k.id)}
                  className="text-xs font-bold transition-opacity hover:opacity-60"
                  style={{ color: '#be123c' }}>
                  ×
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
