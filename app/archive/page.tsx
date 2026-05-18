import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export const revalidate = 3600

export default async function ArchivePage() {
  const { data: issues } = await supabase
    .from('issues')
    .select('*')
    .order('issue_number', { ascending: false })

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#1d1d1f' }}>지난 호</h1>

      <div className="space-y-2">
        {(issues || []).map(issue => (
          <Link
            key={issue.id}
            href={`/archive/${issue.issue_number}`}
            className="flex items-center justify-between px-5 py-4 group transition-opacity hover:opacity-70"
            style={{
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: 12,
            }}
          >
            <div>
              <span className="text-sm font-semibold" style={{ color: '#1d1d1f' }}>
                Vol. {issue.issue_number}
              </span>
              <span className="text-xs ml-3" style={{ color: '#86868b' }}>
                {new Date(issue.published_at).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
            </div>
            <span className="text-sm" style={{ color: '#c7c7cc' }}>→</span>
          </Link>
        ))}

        {!issues?.length && (
          <p className="text-sm py-12 text-center" style={{ color: '#86868b' }}>
            아직 발행된 호가 없습니다.
          </p>
        )}
      </div>
    </main>
  )
}
