'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/swr-fetchers'

type Audience = 'subscribers' | 'non_subscribers'

const INVITE_SUBJECT = 'Rejoignez la newsletter de La Place du Village'
const INVITE_MESSAGE = `Bonjour,

Une fois par semaine, on vous envoie le meilleur de La Place du Village : les nouveaux événements, les annonces à ne pas manquer et les actus du village.

Vous n'aviez pas encore eu l'occasion de choisir — abonnez-vous en un clic ci-dessous. C'est gratuit, et vous pouvez vous désabonner quand vous voulez.`

export default function NewsletterAdminClient() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()

  const [counts, setCounts] = useState<{ subscribers: number; nonSubscribers: number } | null>(null)
  const [audience, setAudience] = useState<Audience>('subscribers')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // Garde admin
  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) router.replace('/')
  }, [authLoading, user, isAdmin, router])

  // Compteurs
  useEffect(() => {
    if (authLoading || !isAdmin) return
    authedFetch('/api/admin/newsletter').then(async r => {
      if (r.ok) setCounts(await r.json())
    }).catch(() => {})
  }, [authLoading, isAdmin])

  const pickAudience = (a: Audience) => {
    setAudience(a)
    if (a === 'non_subscribers' && !subject.trim() && !message.trim()) {
      setSubject(INVITE_SUBJECT); setMessage(INVITE_MESSAGE)
    }
  }

  const recipientCount = counts ? (audience === 'subscribers' ? counts.subscribers : counts.nonSubscribers) : 0

  const send = async () => {
    if (!subject.trim() || !message.trim()) { toast.error('Sujet et message requis'); return }
    if (recipientCount === 0) { toast.error('Aucun destinataire dans cette liste'); return }
    const label = audience === 'subscribers' ? 'aux abonnés' : 'd’invitation aux non-abonnés'
    if (!confirm(`Envoyer cet email ${label} à ${recipientCount} personne${recipientCount > 1 ? 's' : ''} ?`)) return
    setSending(true)
    try {
      const r = await authedFetch('/api/admin/newsletter/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience, subject: subject.trim(), message: message.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec de l’envoi')
      toast.success(`Envoyé à ${d.sent}/${d.total} destinataire${d.total > 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally { setSending(false) }
  }

  if (authLoading || !isAdmin) return <div className="flex min-h-[100dvh] items-center justify-center bg-creme"><div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>

  return (
    <div className="min-h-[100dvh] bg-creme font-inter" style={{ paddingBottom: 40 }}>
      <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(16px,env(safe-area-inset-top,16px))' }}>
        <button onClick={() => router.back()} aria-label="Retour" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="font-serif text-[21px] leading-none text-texte">Newsletter</div>
      </div>

      {/* Listes */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-5">
        <button onClick={() => pickAudience('subscribers')}
          className="rounded-2xl border-2 bg-white p-3 text-left"
          style={{ borderColor: audience === 'subscribers' ? 'var(--primary)' : '#EDE6DA' }}>
          <div className="text-[22px] font-extrabold text-texte">{counts?.subscribers ?? '…'}</div>
          <div className="text-[12px] font-semibold text-texte-doux">Abonnés</div>
        </button>
        <button onClick={() => pickAudience('non_subscribers')}
          className="rounded-2xl border-2 bg-white p-3 text-left"
          style={{ borderColor: audience === 'non_subscribers' ? 'var(--primary)' : '#EDE6DA' }}>
          <div className="text-[22px] font-extrabold text-texte">{counts?.nonSubscribers ?? '…'}</div>
          <div className="text-[12px] font-semibold text-texte-doux">Non-abonnés (invitation)</div>
        </button>
      </div>

      <p className="px-4 pt-3 text-[12px] leading-relaxed text-texte-doux">
        {audience === 'subscribers'
          ? 'Envoi de la newsletter aux personnes abonnées (avec lien de désabonnement).'
          : 'Envoi d’une invitation à s’abonner aux personnes pas encore abonnées (avec bouton « Je m’abonne »).'}
      </p>

      {/* Compose */}
      <div className="px-4 pt-2">
        <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Sujet</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet de l’email"
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-[14px] text-texte outline-none" style={{ borderColor: '#EDE6DA' }} />

        <label className="mb-1.5 mt-4 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Message</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={12} placeholder="Écris ta newsletter… (saute une ligne pour séparer les paragraphes)"
          className="w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-[14px] leading-[1.5] text-texte outline-none" style={{ borderColor: '#EDE6DA' }} />

        <button onClick={send} disabled={sending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-none bg-primary py-3.5 text-[14px] font-extrabold text-white disabled:opacity-60">
          {sending ? 'Envoi…' : `Envoyer à ${recipientCount} destinataire${recipientCount > 1 ? 's' : ''}`}
        </button>
        <p className="mt-2 text-center text-[11px] text-texte-doux">L’email part de lettre@laplaceduvillage.app via Resend.</p>
      </div>
    </div>
  )
}
