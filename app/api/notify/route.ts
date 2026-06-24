import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewsletterEmail, generateEmailSubject } from '@/lib/email'

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

    // ── 중복 발송 방지 ──────────────────────────────────────────
    // INSERT ON CONFLICT DO NOTHING으로 원자적 잠금: 최초 호출만 행을 만들고 진행.
    // 이미 행이 있으면 insert가 0행을 반환 → 다른 프로세스가 이미 처리 중/완료.
    const { data: lockRows, error: lockError } = await supabaseAdmin
      .from('email_logs')
      .upsert(
        { issue_number: issue.issue_number, recipients: 0 },
        { onConflict: 'issue_number', ignoreDuplicates: true }
      )
      // email_logs 테이블엔 id 컬럼이 없다 → 존재하는 issue_number를 반환받는다.
      // (과거 .select('id')는 42703 에러를 내고 삼켜져 발송이 통째로 막혔다)
      .select('issue_number')

    // 잠금 INSERT 자체가 실패했으면 절대 '이미 발송됨'으로 조용히 넘기면 안 된다.
    // (예: service_role 권한이 아니라 RLS에 막히는 경우) — 명확히 에러를 드러낸다.
    if (lockError) {
      console.error('email_logs lock upsert error:', lockError)
      return NextResponse.json({
        error: 'lock_failed',
        detail: lockError.message,
        code: lockError.code,
      }, { status: 500 })
    }

    // ignoreDuplicates: true 이면 기존 행이 있을 때 data = [] (빈 배열)
    if (!lockRows || lockRows.length === 0) {
      const { data: existingLog } = await supabaseAdmin
        .from('email_logs')
        .select('sent_at, recipients')
        .eq('issue_number', issue.issue_number)
        .single()
      // 기존 행이 실제로 있을 때만 '이미 발송됨'. 행도 없고 에러도 없는데
      // 잠금이 비어있다면 insert가 무력화된 비정상 상태이므로 드러낸다.
      if (!existingLog) {
        console.error(`notify lock empty with no existing row for issue ${issue.issue_number}`)
        return NextResponse.json({
          error: 'lock_empty_no_row',
          detail: 'upsert가 행을 만들지 못했고 기존 행도 없음 (service_role 권한/RLS 의심)',
        }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        sent: 0,
        message: `Vol.${issue.issue_number} 이미 발송됨 (${existingLog.sent_at}, ${existingLog.recipients}명) — 중복 방지`,
      })
    }
    // 잠금 획득 성공 → 이 프로세스가 발송을 담당

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

    // 제목 한 번만 생성
    const subject = await generateEmailSubject(
      issue.issue_number,
      papers.map((p: any) => p.title)
    )

    // 전체 발송
    let sent = 0
    const errors: string[] = []

    for (const sub of subscribers) {
      try {
        await sendNewsletterEmail(
          {
            to: sub.email,
            name: sub.name || undefined,
            issueNumber: issue.issue_number,
            papers,
            horoscope: issue.horoscope,
          },
          subject
        )
        sent++
      } catch (e) {
        console.error(`Failed to send to ${sub.email}:`, e)
        errors.push(sub.email)
      }
    }

    // ── 발송 결과로 email_logs 업데이트 ────────────────────────
    // upsert로 잠금 시 recipients=0으로 행을 만들었으므로 실제 발송 수로 갱신
    const { error: updateErr } = await supabaseAdmin
      .from('email_logs')
      .update({ recipients: sent })
      .eq('issue_number', issue.issue_number)
    if (updateErr) console.error('email_logs update error:', updateErr.message)

    return NextResponse.json({ success: true, sent, errors: errors.length ? errors : undefined })
  } catch (error) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
