'use client'
import { useEffect, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CallbackHandler() {
  const searchParams = useSearchParams()
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function go() {
      if (cancelled) return
      cancelled = true
      // Hard reload — ré-init AuthContext avec la session présente
      window.location.replace(next)
    }

    // Écoute SIGNED_IN : c'est le seul signal fiable que la session a été
    // écrite dans le storage par supabase-js. exchangeCodeForSession peut
    // resolve avant que l'écriture soit committed → reload prématuré =
    // AuthContext qui voit pas la session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (timeoutId) clearTimeout(timeoutId)
        go()
      }
    })

    async function run() {
      if (!code) { go(); return }
      try {
        await supabase.auth.exchangeCodeForSession(code)
        // Filet de sécurité : si pour une raison X SIGNED_IN n'arrive pas
        // (déjà signé in avant ?), on reload après 1.5s quand même.
        timeoutId = setTimeout(() => {
          setHint('Connexion plus longue que prévu…')
          go()
        }, 1500)
      } catch {
        setHint('Connexion échouée — retour à l\'accueil')
        timeoutId = setTimeout(go, 1000)
      }
    }

    run()

    return () => { subscription.unsubscribe(); if (timeoutId) clearTimeout(timeoutId) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      backgroundColor: '#FBF7F0',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '4px solid #E0D8CE', borderTopColor: '#C4622D',
        animation: 'spin 0.7s linear infinite',
      }} />
      {hint && (
        <p style={{ fontSize: 12, color: '#7A6A5A', fontFamily: 'Inter, sans-serif', margin: 0 }}>
          {hint}
        </p>
      )}
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
