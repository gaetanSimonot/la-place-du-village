'use client'
import { useEffect, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sanitizeNext } from '@/lib/authRedirect'

function CallbackHandler() {
  const searchParams = useSearchParams()
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    // Sanitize cote reception : meme si on a sanitize cote envoi, on
    // re-valide (defense en profondeur). Un attaquant pourrait avoir
    // construit un lien direct vers /auth/callback?next=evil.
    const rawNext = searchParams.get('next')
    const next = sanitizeNext(rawNext)

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function go() {
      if (cancelled) return
      cancelled = true
      // Hard reload — re-init AuthContext avec la session presente
      window.location.replace(next)
    }

    // Ecoute SIGNED_IN : seul signal fiable que la session a ete ecrite
    // dans le storage par supabase-js. exchangeCodeForSession peut resolve
    // avant que l ecriture soit committed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (timeoutId) clearTimeout(timeoutId)
        go()
      }
    })

    async function run() {
      if (!code) { go(); return }
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) setHint(`Erreur : ${error.message}`)
        // Filet de securite : si SIGNED_IN n arrive pas (cas deja signe ?),
        // on reload apres 1.5s. Si l exchange a fail, on quitte la page.
        timeoutId = setTimeout(() => {
          setHint('Connexion plus longue que prévu…')
          go()
        }, 1500)
      } catch {
        // L exchange peut throw alors que la session est quand meme
        // etablie en fallback par detectSessionInUrl. On verifie avant
        // d afficher un message d echec trompeur.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) setHint('Connexion échouée — retour à l\'accueil')
        timeoutId = setTimeout(go, session ? 200 : 1000)
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
