import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter, Noto_Sans_KR } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansKR = Noto_Sans_KR({
  weight: ['400', '500', '700'],
  variable: '--font-noto-kr',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LabPaper — 주간 논문 뉴스레터',
  description: '매주 월요일, 우리 분야 핵심 논문을 한눈에',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${inter.variable} ${notoSansKR.variable}`}>
      <body className="min-h-screen">
        <nav
          className="sticky top-0 z-10"
          style={{
            backgroundColor: 'rgba(255,255,255,0.85)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div className="max-w-3xl mx-auto px-5 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold text-sm" style={{ color: '#1d1d1f' }}>
              LabPaper
            </Link>
            <div className="flex gap-5 text-sm" style={{ color: '#6e6e73' }}>
              <Link href="/archive" className="hover:text-gray-900 transition-colors">지난 호</Link>
              <Link href="/best" className="hover:text-gray-900 transition-colors">베스트</Link>
              <Link href="/suggest" className="hover:text-gray-900 transition-colors">저자 제안</Link>
            </div>
            <Link href="/admin" className="ml-auto text-xs transition-colors" style={{ color: '#c7c7cc' }}>
              관리자
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
