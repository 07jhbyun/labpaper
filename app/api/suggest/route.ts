import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase.from('author_suggestions').insert({
    name: text.trim().slice(0, 100),
    reason: text.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  if (gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })
      await transporter.sendMail({
        from: `LabPaper <${gmailUser}>`,
        to: gmailUser,
        subject: '[LabPaper] 새 제안이 들어왔습니다',
        text: `새 제안이 들어왔습니다:\n\n${text.trim()}`,
      })
    } catch (e) {
      console.error('[suggest] email failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
