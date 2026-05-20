'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import type { Covoiturage } from '@/lib/covoiturage'

type CovoitFull = Covoiturage & {
  conducteur: { display_name: string | null; avatar_url: string | null } | null
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', backgroundColor: '#2D5A3D',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

export default function CovoitDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [covoit, setCovoit] = useState<CovoitFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [favori, setFavori] = useState(false)
  const [favLoading, setFavLoading] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/covoiturages/${id}`)
    const d = await res.json()
    if (!res.ok) { setError(d.error || 'Introuvable'); setLoading(false); return }
    setCovoit(d.covoiturage)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Charge l'état favori si user connecté
  useEffect(() => {
    if (!user) { setFavori(false); return }
    let cancel = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch(`/api/covoiturages/${id}/favori`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (cancel || !res.ok) return
      const d = await res.json()
      setFavori(!!d.favori)
    })()
    return () => { cancel = true }
  }, [id, user])

  const toggleFavori = async () => {
    if (!user) { openAuthModal(`/covoiturage/${id}`); return }
    if (favLoading) return
    setFavLoading(true)
    // Optimistic
    const prev = favori
    setFavori(!prev)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`/api/covoiturages/${id}/favori`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) { setFavori(prev) } // rollback
    else {
      const d = await res.json()
      setFavori(!!d.favori)
    }
    setFavLoading(false)
  }

  const isOwner = !!user && !!covoit && user.id === covoit.user_id
  const placesRest = covoit ? covoit.places - covoit.places_prises : 0

  const handleCandidater = async () => {
    if (!user) { openAuthModal(`/covoiturage/${id}`); return }
    if (!message.trim()) { setError('Écris un petit mot au conducteur'); return }
    setSending(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/covoiturages/${id}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: message.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      router.push(`/covoiturage/conversations/${d.conversation.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSending(false)
    }
  }

  const handleShare = async () => {
    if (!covoit) return
    const url = typeof window !== 'undefined' ? `${window.location.origin}/covoiturage/${id}` : ''
    const text = `Covoit ${covoit.depart} → ${covoit.destination} le ${fmtDate(covoit.date_trajet)}${covoit.heure_depart ? ` à ${covoit.heure_depart}` : ''} · ${covoit.prix > 0 ? covoit.prix + ' €' : 'Gratuit'}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Covoiturage', text, url })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {})
      setShareOpen(true)
      setTimeout(() => setShareOpen(false), 2500)
    }
  }

  const handleAnnuler = async () => {
    if (!covoit || !isOwner) return
    if (!confirm('Annuler ce trajet ? Les candidatures en cours seront fermées.')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch(`/api/covoiturages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ statut: 'annule' }),
    })
    router.push('/covoiturage')
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-texte-doux">Chargement…</p>
      </main>
    )
  }
  if (!covoit) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-accent">{error ?? 'Trajet introuvable'}</p>
        <Link href="/covoiturage" className="mt-2 inline-block text-[12px] text-primary">← Retour</Link>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/covoiturage"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Trajet
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!isOwner && (
            <button
              type="button"
              onClick={toggleFavori}
              aria-label={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              disabled={favLoading}
              className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white"
              style={{
                borderColor: favori ? '#C84B2F' : '#E8E0D4',
                color:       favori ? '#C84B2F' : '#7A6A5A',
                background:  favori ? '#FFF0E5' : '#fff',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={favori ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Partager"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-bord bg-white text-texte"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        </div>
      </div>

      {shareOpen && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-white shadow-lg">
          Lien copié !
        </div>
      )}

      {/* Hero card */}
      <div className="px-4 pt-5">
        <div className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">
              {fmtDate(covoit.date_trajet)}{covoit.heure_depart && ` · ${covoit.heure_depart}`}
            </span>
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase"
              style={{
                background: covoit.statut === 'complet' ? '#FFF0E5' :
                            covoit.statut === 'annule'  ? '#F0EAE0' : '#E8F2EB',
                color:      covoit.statut === 'complet' ? '#C84B2F' :
                            covoit.statut === 'annule'  ? '#7A6A5A' : '#2D5A3D',
              }}
            >
              {covoit.statut === 'complet' ? 'Complet'
               : covoit.statut === 'annule'  ? 'Annulé'
               : `${placesRest} place${placesRest > 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="mt-3 flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="my-1 h-7 w-px bg-bord" />
              <div className="h-2.5 w-2.5 rounded-full border-2 border-primary bg-white" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="break-words text-[16px] font-bold leading-tight text-texte">{covoit.depart}</div>
              <div className="break-words text-[16px] font-bold leading-tight text-texte">{covoit.destination}</div>
            </div>
          </div>

          {covoit.point_recup && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-cremeDeep px-3 py-2.5 text-[12px] text-texte-doux">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
              <div className="min-w-0 break-words">
                <div className="font-bold text-texte">Récup&apos;</div>
                <div>{covoit.point_recup}</div>
              </div>
            </div>
          )}

          {covoit.vehicule && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-cremeDeep px-3 py-2.5 text-[12px] text-texte-doux">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
                <circle cx="6.5" cy="16.5" r="2.5"/>
                <circle cx="16.5" cy="16.5" r="2.5"/>
              </svg>
              <div className="min-w-0 break-words">
                <div className="font-bold text-texte">Véhicule</div>
                <div>{covoit.vehicule}</div>
              </div>
            </div>
          )}

          {/* Conducteur */}
          <Link
            href={covoit.user_id ? `/profil/${covoit.user_id}` : '#'}
            className="mt-3 flex items-center gap-3 rounded-xl border border-bordSoft bg-white p-2.5 no-underline"
          >
            <Avatar name={covoit.conducteur?.display_name ?? 'C'} url={covoit.conducteur?.avatar_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-texte">{covoit.conducteur?.display_name ?? 'Conducteur'}</div>
              <div className="text-[10.5px] text-texte-doux">Voir le profil →</div>
            </div>
          </Link>

          {/* Prix + préférences */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-cremeDeep px-3 py-2.5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-texte-doux">Prix par personne</div>
              <div className="font-serif text-[20px] leading-none text-primary">
                {covoit.prix > 0 ? `${covoit.prix.toFixed(2).replace(/\.00$/, '')} €` : 'Gratuit'}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[18px]">
              <Pref icon="🚭" label="Fumeur"  ok={!covoit.fumeur}  okHint="Non-fumeur" koHint="Fumeur OK" />
              <Pref icon="🐶" label="Animaux" ok={covoit.animaux}  okHint="Acceptés"   koHint="Refusés" />
              <Pref icon="🎒" label="Bagages" ok={covoit.bagages}  okHint="Acceptés"   koHint="Pas de gros" />
            </div>
          </div>

          {covoit.description && (
            <div className="mt-3 whitespace-pre-wrap rounded-xl bg-cremeDeep p-3 text-[13px] leading-[1.5] text-texte">
              {covoit.description}
            </div>
          )}
        </div>
      </div>

      {/* Owner actions / Candidat form */}
      {isOwner ? (
        <div className="mt-4 px-4">
          <div className="rounded-2xl border border-bord bg-white p-4">
            <p className="m-0 mb-3 text-[13px] text-texte-doux">
              C&apos;est votre trajet. Vous recevrez les candidatures par notification.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href={`/covoiturage/mes-conversations?covoit=${covoit.id}`}
                className="rounded-xl border border-bord bg-white py-2.5 text-center text-[13px] font-bold text-texte no-underline"
              >
                Voir les candidatures
              </Link>
              {covoit.statut !== 'annule' && (
                <Link
                  href={`/covoiturage/nouveau?id=${covoit.id}`}
                  className="rounded-xl bg-primary py-2.5 text-center text-[13px] font-bold text-white no-underline"
                >
                  Modifier le trajet
                </Link>
              )}
              {covoit.statut !== 'annule' && (
                <button
                  type="button"
                  onClick={handleAnnuler}
                  className="rounded-xl border border-accent bg-white py-2.5 text-[13px] font-bold text-accent"
                >
                  Annuler ce trajet
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        covoit.statut === 'actif' && (
          <div className="mt-4 px-4">
            <div className="rounded-2xl border border-bord bg-white p-4">
              <h3 className="m-0 mb-2 font-serif text-[16px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                Candidater à ce trajet
              </h3>
              <p className="m-0 mb-3 text-[12px] text-texte-doux">
                Présente-toi en quelques mots. Le conducteur recevra une notification et pourra te répondre en privé.
              </p>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, 400))}
                rows={3}
                placeholder="Bonjour, je serais intéressé(e) par ce trajet…"
                className="block w-full resize-none rounded-xl border border-bord bg-cremeDeep px-3 py-2.5 text-[13px] text-texte outline-none focus:border-primary"
              />
              <div className="mt-1 text-right text-[10px] text-texte-doux">{message.length}/400</div>
              <button
                type="button"
                onClick={handleCandidater}
                disabled={sending || !message.trim()}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-none bg-primary text-[14px] font-bold text-white disabled:opacity-55"
              >
                {sending ? 'Envoi…' : 'Envoyer ma candidature'}
              </button>
              {error && <p className="mt-2 text-[12px] text-accent">{error}</p>}
            </div>
          </div>
        )
      )}

      {covoit.statut === 'complet' && !isOwner && (
        <div className="mt-4 px-4">
          <div className="rounded-2xl border border-bord bg-[#FFF0E5] p-4 text-center">
            <p className="m-0 text-[13px] font-bold text-[#C84B2F]">Ce trajet est complet.</p>
          </div>
        </div>
      )}

      <BottomNavBar />
    </main>
  )
}

function Pref({ icon, label, ok, okHint, koHint }: {
  icon: string
  label: string
  ok: boolean
  okHint: string
  koHint: string
}) {
  return (
    <span
      title={`${label} : ${ok ? okHint : koHint}`}
      style={{ opacity: ok ? 1 : 0.35, filter: ok ? 'none' : 'grayscale(1)' }}
    >
      {icon}
    </span>
  )
}
