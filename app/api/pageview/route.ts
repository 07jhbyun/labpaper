import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { page, session_id } = await req.json()
    if (!page || !session_id) return NextResponse.json({ ok: false })
    await supabaseAdmin.from('page_views').insert({ page, session_id })
  } catch {
    // 통계 실패는 무시
  }
  return NextResponse.json({ ok: true })
}
