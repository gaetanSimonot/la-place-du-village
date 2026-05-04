'use client'
import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CallbackHandler() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(() => router.replace(next))
        .catch(() => router.replace('/'))
    } else {
      router.replace('/')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#FBF7F0',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '4px solid #E0D8CE', borderTopColor: '#C4622D',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
