import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body.name ?? '').trim().slice(0, 100)
    const email = String(body.email ?? '').trim().toLowerCase()

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '올바른 이메일을 입력해주세요.' }, { status: 400 })
    }

    // 이미 등록된 이메일인지 확인
    const { data: existing } = await supabaseAdmin
      .from('subscribers')
      .select('id, active')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      // 이전에 구독 해지한 경우 다시 활성화
      if (!existing.active) {
        await supabaseAdmin
          .from('subscribers')
          .update({ active: true, name })
          .eq('id', existing.id)
        return NextResponse.json({ ok: true, message: '구독 신청이 완료됐습니다!' })
      }
      return NextResponse.json({ duplicate: true, message: '이미 구독 중입니다.' }, { status: 409 })
    }

    const { error } = await supabaseAdmin
      .from('subscribers')
      .insert({ email, name })

    if (error) {
      // unique 제약 위반 (경쟁 조건 대비)
      if (error.code === '23505') {
        return NextResponse.json({ duplicate: true, message: '이미 구독 중입니다.' }, { status: 409 })
      }
      console.error('[subscribe] insert failed:', error)
      return NextResponse.json({ error: '구독 처리에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: '구독 신청이 완료됐습니다!' })
  } catch (e) {
    console.error('[subscribe] error:', e)
    return NextResponse.json({ error: '구독 처리에 실패했습니다.' }, { status: 500 })
  }
}
