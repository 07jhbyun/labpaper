import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewsletterEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { issue_number: bodyIssueNumber } = body

    // 이슈 조회 (body에 issue_number 있으면 해당 이슈, 없으면 최신)
    const { data: issue } = bodyIssueNumber
      ? await supabaseAdmin.from('issues').select('*').eq('issue_number', bodyIssueNumber).single()
      : await supabaseAdmin.from('issues').select('*').order('issue_number', { ascending: false }).limit(1).single()

    if (!issue) {
      return NextResponse.json({ error: 'No issue found' }, { status: 404 })
    }

    // 해당 이슈 논문 조회
    const { data: papers } = await supabaseAdmin
      .from('papers')
      .select('title, journal, journal_tier, doi')
      .eq('issue_number', issue.issue_number)
      .order('created_at', { ascending: true })

    if (!papers?.length) {
      return NextResponse.json({ error: 'No papers found' }, { status: 404 })
    }

    // 활성 구독자 조회
    const { data: subscribers } = await supabaseAdmin
      .from('subscribers')
      .select('email, name')
      .eq('active', true)

    if (!subscribers?.length) {
      return NextResponse.json({ success: true, sent: 0, message: '구독자 없음' })
    }

    // 전체 발송
    let sent = 0
    const errors: string[] = []

    for (const sub of subscribers) {
      try {
        await sendNewsletterEmail({
          to: sub.email,
          name: sub.name || undefined,
          issueNumber: issue.issue_number,
          papers,
          horoscope: issue.horoscope,
        })
        sent++
      } catch (e) {
        console.error(`Failed to send to ${sub.email}:`, e)
        errors.push(sub.email)
      }
    }

    return NextResponse.json({ success: true, sent, errors: errors.length ? errors : undefined })
  } catch (error) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
