// 논문 자동 수집: Semantic Scholar API + Crossref API
// 둘 다 무료, API 키 불필요

const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1'
const CROSSREF_API = 'https://api.crossref.org/works'

export const JOURNAL_ISSN_MAP: Record<string, string> = {
  'Nature': '0028-0836',
  'Science': '0036-8075',
  'Nature Nanotechnology': '1748-3387',
  'Nature Energy': '2058-7546',
  'Nature Chemistry': '1755-4330',
  'Nature Catalysis': '2520-1158',
  'Nature Water': '2731-6084',
  'Nature Sustainability': '2398-9629',
  'Nature Communications': '2041-1723',
  'Joule': '2542-4351',
  'Matter': '2590-2385',
  'Chem': '2451-9294',
  'Science Advances': '2375-2548',
  'Advanced Materials': '1521-4095',
  'Advanced Functional Materials': '1616-3028',
  'ACS Energy Letters': '2380-8195',
  'ACS Nano': '1936-0851',
  'Nano Letters': '1530-6984',
  'Nano Energy': '2211-2855',
  'Energy & Environmental Science': '1754-5706',
  'Angewandte Chemie International Edition': '1521-3773',
  'Journal of the American Chemical Society': '0002-7863',
  'Chemical Science': '2041-6520',
  'ACS Catalysis': '2155-5435',
  'ACS Applied Materials & Interfaces': '1944-8244',
  'Chemical Engineering Journal': '1385-8947',
  'Small': '1613-6829',
  'Journal of Membrane Science': '0376-7388',
  'Water Research': '0043-1354',
  'Applied Catalysis B Environmental': '0926-3373',
  'Environmental Science & Technology': '0013-936X',
  'ChemCatChem': '1867-3880',
  'Chemistry of Materials': '0897-4756',
  'Green Chemistry': '1463-9262',
  'ChemSusChem': '1864-5631',
  'Cell Reports Physical Science': '2666-3864',
}

export const JOURNAL_IF_MAP: Record<string, number> = {
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

const KEYWORDS = [
  'porous polymer', 'conjugated polymer', 'photocatal', 'electrocatal',
  'water treatment', 'water purification', 'membrane', 'covalent organic',
  'COF', 'H2O2', 'MOF', 'metal-organic framework', 'metal organic framework',
  'covalent triazine', 'CTF', 'hydrogen peroxide', 'photo-Fenton',
  'deionization', 'deep eutectic solvent', 'lithium battery recycling',
  'contact electrification', 'heterogeneous catalysis', 'radical photocatalysis',
  'organic semiconductor', 'bandgap', 'band gap', 'visible light',
]

const REVIEW_TITLE_KEYWORDS = ['review', 'perspective', 'progress', 'outlook', 'highlight']
const REVIEW_ABSTRACT_PHRASES = ['this review', 'in this review', 'we review']

export function passesKeywordFilter(title: string, abstract: string): boolean {
  const text = `${title} ${abstract}`.toLowerCase()
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
}

export function isReviewPaper(title: string, abstract: string): boolean {
  const titleLower = title.toLowerCase()
  if (REVIEW_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))) return true
  const abstractLower = abstract.toLowerCase()
  return REVIEW_ABSTRACT_PHRASES.some(phrase => abstractLower.includes(phrase))
}

export async function fetchPapersByAuthor(authorName: string): Promise<RawPaper[]> {
  try {
    const res = await fetch(
      `${SEMANTIC_SCHOLAR_API}/author/search?query=${encodeURIComponent(authorName)}&fields=authorId,name`,
      { headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
    const data = await res.json()
    if (!data.data?.length) return []

    const authorId = data.data[0].authorId
    const papersRes = await fetch(
      `${SEMANTIC_SCHOLAR_API}/author/${authorId}/papers?fields=title,authors,year,journal,externalIds,abstract,tldr&limit=5&sort=publicationDate`,
      { headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
    const papersData = await papersRes.json()

    return (papersData.data || [])
      .filter((p: any) => p.year >= new Date().getFullYear())
      .map((p: any) => ({
        title: p.title,
        authors: p.authors?.map((a: any) => a.name).join(', ') || authorName,
        journal: p.journal?.name || 'Unknown',
        year: p.year,
        doi: p.externalIds?.DOI,
        abstract: p.abstract || p.tldr?.text || '',
      }))
  } catch (e) {
    console.error(`Failed to fetch papers for ${authorName}:`, e)
    return []
  }
}

export async function fetchPapersByJournal(journalName: string, issn: string): Promise<RawPaper[]> {
  try {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 14)
    const from = fromDate.toISOString().split('T')[0]

    const res = await fetch(
      `${CROSSREF_API}?filter=issn:${issn},from-pub-date:${from}&sort=published&order=desc&rows=10&select=title,author,published,DOI,abstract,container-title`,
      { headers: { 'User-Agent': 'LabPaper/1.0 (mailto:your@email.com)' } }
    )
    const data = await res.json()

    return (data.message?.items || []).map((item: any) => ({
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      authors: item.author
        ?.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim())
        .join(', ') || '',
      journal: journalName,
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      doi: item.DOI,
      abstract: item.abstract?.replace(/<[^>]*>/g, '') || '',
    }))
  } catch (e) {
    console.error(`Failed to fetch papers for journal ${journalName}:`, e)
    return []
  }
}

export interface RawPaper {
  title: string
  authors: string
  journal: string
  year: number
  doi?: string
  abstract: string
}

// 관련 핵심 논문 검색 (Semantic Scholar)
export async function findRelatedPapers(title: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${SEMANTIC_SCHOLAR_API}/paper/search?query=${encodeURIComponent(title)}&fields=title,authors,year,journal,externalIds&limit=3`,
      { headers: { 'User-Agent': 'LabPaper/1.0' } }
    )
    const data = await res.json()
    return (data.data || []).slice(0, 2).map((p: any) => ({
      title: p.title,
      journal: p.journal?.name || '',
      year: p.year,
      doi: p.externalIds?.DOI,
    }))
  } catch {
    return []
  }
}
