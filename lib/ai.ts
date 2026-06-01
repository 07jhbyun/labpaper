import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e: any) {
    if (e?.status === 429 || e?.message?.includes('rate')) {
      await new Promise(r => setTimeout(r, 3000))
      return fn()
    }
    throw e
  }
}

// 논문 핵심 결과 bullet 3개 생성
export async function generateSummaryBullets(
  title: string,
  abstract: string,
  journal: string
): Promise<string[]> {
  try {
    const msg = await callWithRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `다음 논문의 핵심 결과를 한국어로 bullet point 3개로 요약해줘.
각 bullet은 구체적인 수치나 결과를 포함해서 1-2문장으로.
JSON 배열 형식으로만 답해줘: ["bullet1", "bullet2", "bullet3"]

제목: ${title}
저널: ${journal}
초록: ${abstract}`
      }]
    }))

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const bullets = JSON.parse(cleaned)
    return Array.isArray(bullets) ? bullets.slice(0, 3) : []
  } catch {
    return [
      '논문 요약을 불러오는 중 오류가 발생했습니다.',
      '원문 링크에서 직접 확인해주세요.',
      ''
    ]
  }
}

// 논문 제목 한국어 번역
export async function generateTitleKo(title: string): Promise<string> {
  try {
    const msg = await callWithRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `다음 논문 제목을 한국어로 자연스럽게 번역해줘. 번역문만 답해줘.\n${title}`,
      }]
    }))
    return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

// 이메일 제목 생성 — [LabPaper] + 장난스러운 한 줄
export async function generateEmailSubject(
  issueNumber: number,
  paperTitles: string[]
): Promise<string> {
  try {
    const context = paperTitles.slice(0, 5).join(' / ')
    const msg = await callWithRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `너는 연구실 막내 대학원생이야. 이번 주 LabPaper 뉴스레터 이메일 제목을 한 줄로 만들어줘.
톤: 장난스럽고 약간 도발적, 대학원생 감성. 이모지 1개 포함.
예시: "이번 주 논문 안 읽니? 👀", "당신의 라이벌은 지금 이 논문 읽는 중입니다", "Reviewer 2보다 먼저 읽어보세요 📄"
이번 주 논문 키워드: ${context}
제목 텍스트만 답해줘. 따옴표 없이.`
      }]
    }))

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    return `[LabPaper] ${text}`
  } catch {
    const fallbacks = [
      '이번 주 논문 안 읽니? 👀',
      '당신의 라이벌은 지금 이 논문 읽는 중입니다',
      'Reviewer 2보다 먼저 읽어보세요 📄',
      `Vol.${issueNumber} 나왔습니다. 안 읽으면 뒤처집니다`,
      '이번 주도 논문은 쌓여갑니다 🥲',
    ]
    return `[LabPaper] ${fallbacks[issueNumber % fallbacks.length]}`
  }
}

// 주간 논문 밈 요약 생성
export async function generateWeeklyHoroscope(
  issueNumber: number,
  paperTitles: string[],
  paperAbstracts?: string[]
): Promise<{
  paper_luck: string
  experiment_luck: string
  citation_luck: string
  reviewer_luck: string
}> {
  try {
    const context = paperTitles.slice(0, 5).map((t, i) =>
      `${i + 1}. ${t}${paperAbstracts?.[i] ? ` — ${paperAbstracts[i].slice(0, 150)}` : ''}`
    ).join('\n')

    const msg = await callWithRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `너는 연구실 막내 대학원생이야. 이번 주 논문들을 읽고 완전 솔직하게, 밈 감성으로 요약해줘.
뻔한 말 금지. 진짜 논문 내용 이해하고 거기서 나오는 개그여야 함. 한국어로.

이번 주 논문들:
${context}

아래 4개 항목을 JSON으로만 답해줘 (설명 없이):
{
  "paper_luck": "이번 주 논문들 전체 분위기를 밈으로 한 줄 요약 (예: '이번 주 테마: 빛으로 모든 걸 해결하려는 사람들')",
  "experiment_luck": "논문 내용에서 뽑은 가장 인상적이거나 황당한 실험/결과를 개그 감성으로",
  "citation_luck": "이번 주 논문들 읽고 느낀 점 or 대학원생 공감 포인트",
  "reviewer_luck": "이번 주 논문 중 하나를 골라서 '이게 왜 실렸냐'거나 '이건 진짜다' 한 줄 평"
}`
      }]
    }))

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      paper_luck: '이번 주 테마: 빛으로 모든 걸 해결하려는 사람들.',
      experiment_luck: 'H₂O₂를 빛으로 만들었다고 함. 그냥 사면 안 되나요.',
      citation_luck: '이번 주도 내 논문은 아무도 안 읽었겠지. 셀프 인용 고려 중.',
      reviewer_luck: '"Reviewer 1: very interesting work" — 이 말이 제일 무섭다.'
    }
  }
}
