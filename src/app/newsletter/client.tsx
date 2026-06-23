'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type State = 'loading' | 'done' | 'error'

export default function NewsletterClient() {
  const [state, setState] = useState<State>('loading')
  const [action, setAction] = useState<'subscribe' | 'unsubscribe'>('subscribe')
  const [name, setName] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const token = p.get('token')
    const a = p.get('a') === 'unsubscribe' ? 'unsubscribe' : 'subscribe'
    setAction(a)
    if (!token) { setErr('Lien invalide.'); setState('error'); return }
    fetch('/api/newsletter/optin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, optin: a === 'subscribe' }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (r.ok) { setName(d.name ?? null); setState('done') }
        else { setErr(d.error ?? 'Une erreur est survenue.'); setState('error') }
      })
      .catch(() => { setErr('Erreur réseau.'); setState('error') })
  }, [])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-creme px-6 text-center font-inter">
      {state === 'loading' && <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />}

      {state === 'done' && (
        <>
          <p className="text-5xl">{action === 'subscribe' ? '🎉' : '👋'}</p>
          <h1 className="mt-4 font-serif text-[24px] text-texte">
            {action === 'subscribe'
              ? `C’est noté${name ? `, ${name}` : ''} !`
              : 'Tu es désabonné·e'}
          </h1>
          <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-texte-doux">
            {action === 'subscribe'
              ? 'Tu recevras chaque semaine le meilleur de La Place du Village : events, annonces et actus du village.'
              : 'Tu ne recevras plus la newsletter. À bientôt sur La Place du Village !'}
          </p>
        </>
      )}

      {state === 'error' && (
        <>
          <p className="text-5xl">😕</p>
          <h1 className="mt-4 font-serif text-[22px] text-texte">Oups</h1>
          <p className="mt-2 max-w-xs text-[14px] text-texte-doux">{err}</p>
        </>
      )}

      <Link href="/" className="mt-7 rounded-2xl bg-primary px-8 py-3 text-[14px] font-bold text-white">
        Aller à La Place du Village
      </Link>
    </div>
  )
}
