'use client'

import { useState, useEffect } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'duplicate' | 'error'

export default function SubscribeButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  // 모달 열릴 때 배경 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  function close() {
    setOpen(false)
    // 닫는 애니메이션 후 상태 초기화
    setTimeout(() => {
      setStatus('idle')
      setMessage('')
      setName('')
      setEmail('')
    }, 200)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'loading') return
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus('success')
        setMessage(data.message || '구독 신청이 완료됐습니다!')
      } else if (res.status === 409 || data.duplicate) {
        setStatus('duplicate')
        setMessage(data.message || '이미 구독 중입니다.')
      } else {
        setStatus('error')
        setMessage(data.error || '구독 처리에 실패했습니다.')
      }
    } catch {
      setStatus('error')
      setMessage('네트워크 오류가 발생했습니다.')
    }
  }

  return (
    <>
      {/* CTA 카드 */}
      <div
        className="mt-6 text-center px-6 py-8"
        style={{
          background: 'linear-gradient(135deg, #f5f5f7, #ffffff)',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 22,
        }}
      >
        <h2 className="text-xl font-bold" style={{ color: '#1d1d1f' }}>
          매주 월요일, 메일함으로
        </h2>
        <p className="text-sm mt-2 mb-6" style={{ color: '#86868b' }}>
          우리 분야 핵심 논문을 놓치지 마세요.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-semibold px-6 py-2.5 transition-transform active:scale-95"
          style={{ backgroundColor: '#0071e3', color: '#fff', borderRadius: 980 }}
        >
          구독하기
        </button>
      </div>

      {/* 모달 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={close}
        >
          <div
            className="w-full max-w-sm p-7"
            style={{
              backgroundColor: '#fff',
              borderRadius: 22,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              animation: 'subModalIn 0.25s cubic-bezier(0.16,1,0.3,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {status === 'success' || status === 'duplicate' ? (
              <div className="text-center py-4">
                <div
                  className="mx-auto mb-4 flex items-center justify-center"
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    backgroundColor: status === 'success' ? '#f0fdf4' : '#fff7e6',
                    fontSize: 28,
                  }}
                >
                  {status === 'success' ? '✅' : '📬'}
                </div>
                <p className="text-lg font-semibold" style={{ color: '#1d1d1f' }}>{message}</p>
                {status === 'success' && (
                  <p className="text-sm mt-1.5" style={{ color: '#86868b' }}>
                    다음 호부터 이메일로 받아보실 수 있어요.
                  </p>
                )}
                <button
                  onClick={close}
                  className="mt-6 text-sm font-semibold w-full py-3 transition-transform active:scale-95"
                  style={{ backgroundColor: '#0071e3', color: '#fff', borderRadius: 12 }}
                >
                  확인
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-xl font-bold" style={{ color: '#1d1d1f' }}>뉴스레터 구독</h2>
                  <button
                    type="button"
                    onClick={close}
                    className="text-lg leading-none -mt-1 -mr-1 p-1"
                    style={{ color: '#c7c7cc' }}
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm mb-5" style={{ color: '#86868b' }}>
                  매주 월요일 새 논문을 이메일로 보내드려요.
                </p>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름 (선택)"
                  className="w-full px-4 py-3 mb-3 text-sm outline-none"
                  style={{ backgroundColor: '#f5f5f7', borderRadius: 12, color: '#1d1d1f' }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일"
                  required
                  autoFocus
                  className="w-full px-4 py-3 text-sm outline-none"
                  style={{ backgroundColor: '#f5f5f7', borderRadius: 12, color: '#1d1d1f' }}
                />

                {status === 'error' && (
                  <p className="text-sm mt-3" style={{ color: '#e11d48' }}>{message}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="mt-5 text-sm font-semibold w-full py-3 transition-transform active:scale-95 disabled:opacity-60"
                  style={{ backgroundColor: '#0071e3', color: '#fff', borderRadius: 12 }}
                >
                  {status === 'loading' ? '처리 중…' : '구독하기'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes subModalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
