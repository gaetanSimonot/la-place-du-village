'use client'
import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/swr-fetchers'
import { GroupCard, ToggleRow, I } from './shared'

/**
 * Carte réglage « Newsletter » — toggle d'abonnement de l'utilisateur courant
 * (profiles.newsletter_optin via /api/newsletter/me).
 */
export default function NewsletterToggleCard() {
  const [optin, setOptin] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    authedFetch('/api/newsletter/me')
      .then(async r => { if (r.ok && !cancelled) setOptin((await r.json()).optin) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const toggle = async (v: boolean) => {
    setOptin(v)
    await authedFetch('/api/newsletter/me', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optin: v }),
    }).catch(() => {})
  }

  if (optin === null) return null

  return (
    <GroupCard kicker="Newsletter" kickerColor="#7A6A5A" icon={I.mail(12)}>
      <ToggleRow
        icon={I.mail(16)}
        label="Recevoir la newsletter"
        sub="Le meilleur du village, une fois par semaine"
        checked={optin}
        onChange={toggle}
        isLast
      />
    </GroupCard>
  )
}
