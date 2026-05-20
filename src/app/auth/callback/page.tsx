'use client'
import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CallbackHandler() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    async function run() {
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
          // Attend que la session soit effectivement résolue côté supabase-js
          // avant de quitter — sinon le hard reload arrive avant que le
          // localStorage soit écrit.
          await supabase.auth.getSession()
        } catch {
          // si échec, on tombe quand même sur la home — l'user retentera
        }
      }
      // Hard reload (pas router.replace) : ça force l'AuthContext a re-init
      // avec la session presente dans localStorage. Indispensable pour eviter
      // l etat "loggé mais l UI pense que non" qu on avait avec la soft nav.
      window.location.replace(next)
    }

    run()
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
