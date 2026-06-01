'use client'

import { useEffect } from 'react'
import { getSessionId } from '@/lib/supabase'

export default function PageViewTracker({ page }: { page: string }) {
  useEffect(() => {
    const session_id = getSessionId()
    fetch('/api/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, session_id }),
    }).catch(() => {})
  }, [page])

  return null
}
