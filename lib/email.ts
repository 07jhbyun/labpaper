import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const FROM = process.env.RESEND_FROM_EMAIL || 'LabPaper <onboarding@resend.dev>'

// 티어별 배지 스타일 (이메일 인라인용)
const TIER_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  crown:   { bg: '#fff7e6', text: '#b45309', icon: '👑' },
  top:     { bg: '#f3e8ff', text: '#6b21a8', icon: '🏆' },
  high:    { bg: '#eff6ff', text: '#1d4ed8', icon: '🥇' },
  mid:     { bg: '#f0fdf4', text: '#166534', icon: '🥈' },
  applied: { bg: '#f9fafb', text: '#374151', icon: '🥉' },
}

// IF 점수 맵 (배지 표시용)
const IF_MAP: Record<string, number> = {
  'Nature': 70, 'Science': 68, 'Nature Nanotechnology': 40, 'Nature Energy': 60,
  'Nature Chemistry': 30, 'Nature Catalysis': 38, 'Nature Water': 25,
  'Nature Sustainability': 30, 'Nature Communications': 17, 'Joule': 46,
  'Matter': 20, 'Chem': 23, 'Science Advances': 13, 'Advanced Materials': 29,
  'Advanced Functional Materials': 19, 'ACS Energy Letters': 16, 'ACS Nano': 17,
  'Nano Letters': 10, 'Nano Energy': 17, 'Energy & Environmental Science': 32,
  'Angewandte Chemie International Edition': 16, 'Journal of the American Chemical Society': 15,
  'Chemical Science': 8, 'ACS Catalysis': 12, 'ACS Applied Materials & Interfaces': 9,
  'Chemical Engineering Journal': 15, 'Small': 13, 'Journal of Membrane Science': 9,
  'Water Research': 11, 'Applied Catalysis B Environmental': 22,
  'Environmental Science & Technology': 11, 'ChemCatChem': 4,
  'Chemistry of Materials': 8, 'Green Chemistry': 9, 'ChemSusChem': 8,
  'Cell Reports Physical Science': 8,
}

interface Paper {
  title: string
  journal: string
  journal_tier: string
  doi?: string | null
}

interface Horoscope {
  reviewer_luck: string
  [key: string]: string
}

interface EmailParams {
  to: string
  name?: string
  issueNumber: number
  papers: Paper[]
  horoscope: Horoscope
}

function buildPapersHtml(papers: Paper[]): string {
  return papers.map((paper, i) => {
    const style = TIER_STYLES[paper.journal_tier] ?? TIER_STYLES['applied']
    const journalIF = IF_MAP[paper.journal]
    const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : SITE_URL
    const isLast = i === papers.length - 1

    return `
      <div style="padding:14px 20px;${isLast ? '' : 'border-bottom:1px solid #f2f2f7;'}">
        <div style="margin-bottom:5px;">
          <span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background-color:${style.bg};color:${style.text};">
            ${style.icon} ${paper.journal}
          </span>
          ${journalIF ? `<span style="font-size:11px;color:#86868b;margin-left:6px;">IF ${journalIF.toFixed(1)}</span>` : ''}
        </div>
        <a href="${doiUrl}" style="font-size:14px;font-weight:600;color:#1d1d1f;text-decoration:none;line-height:1.5;">
          ${paper.title}
        </a>
      </div>
    `
  }).join('')
}

function buildHtml({ name, issueNumber, papers, horoscope }: Omit<EmailParams, 'to'>): string {
  const greeting = name ? `안녕하세요, ${name}님!` : '안녕하세요!'
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">

    <!-- 헤더 -->
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="font-size:26px;font-weight:700;color:#1d1d1f;margin:0 0 4px;">LabPaper</h1>
      <p style="font-size:13px;color:#86868b;margin:0;">Vol. ${issueNumber} · 주간 논문 뉴스레터</p>
    </div>

    <!-- 인사 -->
    <p style="font-size:15px;color:#3a3a3c;margin:0 0 24px;">${greeting} 이번 주 논문 ${papers.length}편이 도착했습니다.</p>

    <!-- 바로가기 버튼 (상단) -->
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${SITE_URL}" style="display:inline-block;background-color:#0071e3;color:#ffffff;font-size:15px;font-weight:600;padding:13px 32px;border-radius:980px;text-decoration:none;">
        LabPaper 바로가기
      </a>
    </div>

    <!-- 밈 요약 -->
    <div style="background-color:#fffbeb;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:12px;font-weight:600;color:#92400e;margin:0 0 6px;">🧪 이번 주 논문 요약 (밈버전)</p>
      <p style="font-size:14px;color:#b45309;margin:0;line-height:1.65;">${horoscope.reviewer_luck}</p>
    </div>

    <!-- 논문 목록 -->
    <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:28px;">
      ${buildPapersHtml(papers)}
    </div>

    <!-- 바로가기 버튼 (하단) -->
    <div style="text-align:center;margin-bottom:36px;">
      <a href="${SITE_URL}" style="display:inline-block;background-color:#1d1d1f;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:980px;text-decoration:none;">
        지금 보러가기 →
      </a>
    </div>

    <!-- 푸터 -->
    <p style="text-align:center;font-size:12px;color:#c7c7cc;margin:0;line-height:1.6;">
      매주 월요일, 우리 분야 핵심 논문을 한눈에<br>
      <a href="${SITE_URL}" style="color:#c7c7cc;">${SITE_URL}</a>
    </p>

  </div>
</body>
</html>
  `.trim()
}

export async function sendNewsletterEmail({ to, name, issueNumber, papers, horoscope }: EmailParams) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `📄 LabPaper Vol.${issueNumber} — 이번 주 논문 ${papers.length}편 나왔습니다`,
    html: buildHtml({ name, issueNumber, papers, horoscope }),
  })
}
