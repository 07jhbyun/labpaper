import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)!
)

export type JournalTier = 'crown' | 'top' | 'high' | 'mid' | 'applied'
export type ReactionType = 'why_here' | 'life_paper' | 'must_cite' | 'gpt_wrote' | 'star'

export interface Paper {
  id: string
  issue_number: number
  title: string
  authors: string
  journal: string
  journal_tier: JournalTier
  year: number
  doi?: string
  abstract?: string
  summary_bullets: string[]
  image_url?: string
  related_papers: RelatedPaper[]
  source: 'auto' | 'manual'
  created_at: string
}

export interface RelatedPaper {
  title: string
  journal: string
  year: number
  doi?: string
}

export interface Issue {
  id: string
  issue_number: number
  published_at: string
  horoscope: Horoscope
}

export interface Horoscope {
  paper_luck: string
  experiment_luck: string
  citation_luck: string
  reviewer_luck: string
}

export interface ReactionCounts {
  paper_id: string
  why_here_count: number
  life_paper_count: number
  must_cite_count: number
  gpt_wrote_count: number
  avg_stars: number
  star_count: number
}

export const SCIENTIST_NAMES = [
  '아인슈타인', '퀴리부인', '다윈', '뉴턴', '패러데이',
  '맥스웰', '볼츠만', '플랑크', '보어', '하이젠베르크',
  '슈뢰딩거', '디랙', '파울리', '페르미', '파인만',
  '오펜하이머', '튜링', '노이만', '가우스', '오일러',
  '라부아지에', '멘델레예프', '훔볼트', '훅', '반데르발스',
  '아레니우스', '르샤틀리에', '노벨', '케쿨레', '리비히',
  '플레밍', '왓슨', '크릭', '프랭클린', '멘델',
  '베르셀리우스', '데이비', '패스퇴르', '코흐', '제너'
]

export function getSessionScientist(): string {
  if (typeof window === 'undefined') return '아인슈타인'
  let name = localStorage.getItem('labpaper_scientist')
  if (!name) {
    name = SCIENTIST_NAMES[Math.floor(Math.random() * SCIENTIST_NAMES.length)]
    localStorage.setItem('labpaper_scientist', name)
  }
  return name
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  let id = localStorage.getItem('labpaper_session')
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('labpaper_session', id)
  }
  return id
}

export interface TierColors {
  icon: string
  badgeBg: string
  badgeText: string
  gradient: string
}

// IF 기준 5단계 티어 색상 (배지 + TOC 그라데이션)
export const JOURNAL_COLORS: Record<string, TierColors> = {
  // 👑 IF 40+
  crown: {
    icon: '👑',
    badgeBg: '#fff7e6',
    badgeText: '#b45309',
    gradient: 'linear-gradient(135deg, #fef3c7, #fde68a)',
  },
  // 🏆 IF 25-39
  top: {
    icon: '🏆',
    badgeBg: '#f3e8ff',
    badgeText: '#6b21a8',
    gradient: 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
  },
  // 🥇 IF 15-24
  high: {
    icon: '🥇',
    badgeBg: '#eff6ff',
    badgeText: '#1d4ed8',
    gradient: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
  },
  // 🥈 IF 8-14
  mid: {
    icon: '🥈',
    badgeBg: '#f0fdf4',
    badgeText: '#166534',
    gradient: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
  },
  // 🥉 IF 8 미만
  applied: {
    icon: '🥉',
    badgeBg: '#f9fafb',
    badgeText: '#374151',
    gradient: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
  },
  // 구버전 티어 폴백
  field: {
    icon: '🏆',
    badgeBg: '#f3e8ff',
    badgeText: '#6b21a8',
    gradient: 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
  },
}

// 저널별 IF 점수 (클라이언트 배지 표시용)
export const JOURNAL_IF_CLIENT_MAP: Record<string, number> = {
  'Nature': 70,
  'Science': 68,
  'Nature Nanotechnology': 40,
  'Nature Energy': 60,
  'Nature Chemistry': 30,
  'Nature Catalysis': 38,
  'Nature Water': 25,
  'Nature Sustainability': 30,
  'Nature Communications': 17,
  'Joule': 46,
  'Matter': 20,
  'Chem': 23,
  'Science Advances': 13,
  'Advanced Materials': 29,
  'Advanced Functional Materials': 19,
  'ACS Energy Letters': 16,
  'ACS Nano': 17,
  'Nano Letters': 10,
  'Nano Energy': 17,
  'Energy & Environmental Science': 32,
  'Angewandte Chemie International Edition': 16,
  'Journal of the American Chemical Society': 15,
  'Chemical Science': 8,
  'ACS Catalysis': 12,
  'ACS Applied Materials & Interfaces': 9,
  'Chemical Engineering Journal': 15,
  'Small': 13,
  'Journal of Membrane Science': 9,
  'Water Research': 11,
  'Applied Catalysis B Environmental': 22,
  'Environmental Science & Technology': 11,
  'ChemCatChem': 4,
  'Chemistry of Materials': 8,
  'Green Chemistry': 9,
  'ChemSusChem': 8,
  'Cell Reports Physical Science': 8,
}

// TOC 그라데이션 블록에 표시할 저널 약어
export const JOURNAL_ABBR_MAP: Record<string, string> = {
  'Nature': 'Nature',
  'Science': 'Science',
  'Nature Nanotechnology': 'Nat. Nano.',
  'Nature Energy': 'Nat. Energy',
  'Nature Chemistry': 'Nat. Chem.',
  'Nature Catalysis': 'Nat. Catal.',
  'Nature Water': 'Nat. Water',
  'Nature Sustainability': 'Nat. Sustain.',
  'Nature Communications': 'Nat. Commun.',
  'Joule': 'Joule',
  'Matter': 'Matter',
  'Chem': 'Chem',
  'Science Advances': 'Sci. Adv.',
  'Advanced Materials': 'Adv. Mater.',
  'Advanced Functional Materials': 'Adv. Funct. Mater.',
  'ACS Energy Letters': 'ACS EL',
  'ACS Nano': 'ACS Nano',
  'Nano Letters': 'Nano Lett.',
  'Nano Energy': 'Nano Energy',
  'Energy & Environmental Science': 'EES',
  'Angewandte Chemie International Edition': 'Angew. Chem.',
  'Journal of the American Chemical Society': 'JACS',
  'Chemical Science': 'Chem. Sci.',
  'ACS Catalysis': 'ACS Catal.',
  'ACS Applied Materials & Interfaces': 'ACS AMI',
  'Chemical Engineering Journal': 'CEJ',
  'Small': 'Small',
  'Journal of Membrane Science': 'J. Membr. Sci.',
  'Water Research': 'Water Res.',
  'Applied Catalysis B Environmental': 'Appl. Catal. B',
  'Environmental Science & Technology': 'ES&T',
  'ChemCatChem': 'ChemCatChem',
  'Chemistry of Materials': 'Chem. Mater.',
  'Green Chemistry': 'Green Chem.',
  'ChemSusChem': 'ChemSusChem',
  'Cell Reports Physical Science': 'CRPS',
}
