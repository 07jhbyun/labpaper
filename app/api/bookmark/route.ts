import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, authors, journal, journal_tier, year, doi, matched_keywords, issue_number } = body

  const { data: bookmark, error } = await supabaseAdmin
    .from('bookmarked_papers')
    .insert({ title, authors, journal, journal_tier, year, doi, matched_keywords, issue_number })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const firstAuthor = (authors || '').split(',')[0].trim()
  if (firstAuthor) {
    const { data: existing } = await supabaseAdmin
      .from('followed_authors').select('id').eq('name', firstAuthor).maybeSingle()
    if (!existing) {
      await supabaseAdmin.from('followed_authors').insert({ name: firstAuthor, status: 'auto_added' })
    }
  }

  for (const kw of (matched_keywords || [])) {
    const { data: existing } = await supabaseAdmin
      .from('keywords').select('id').eq('keyword', kw).maybeSingle()
    if (!existing) {
      await supabaseAdmin.from('keywords').insert({ keyword: kw, source: 'auto_added' })
    }
  }

  return NextResponse.json({ success: true, id: bookmark.id })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()

  const { data: bookmark, error } = await supabaseAdmin
    .from('bookmarked_papers').select('*').eq('id', id).single()
  if (error || !bookmark) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('bookmarked_papers').delete().eq('id', id)

  const firstAuthor = (bookmark.authors || '').split(',')[0].trim()
  if (firstAuthor) {
    const { data: others } = await supabaseAdmin
      .from('bookmarked_papers').select('id').ilike('authors', `%${firstAuthor}%`)
    if (!others?.length) {
      await supabaseAdmin.from('followed_authors')
        .delete().eq('name', firstAuthor).eq('status', 'auto_added')
    }
  }

  for (const kw of (bookmark.matched_keywords || [])) {
    const { data: others } = await supabaseAdmin
      .from('bookmarked_papers').select('id').contains('matched_keywords', [kw])
    if (!others?.length) {
      await supabaseAdmin.from('keywords').delete().eq('keyword', kw).eq('source', 'auto_added')
    }
  }

  return NextResponse.json({ success: true })
}
