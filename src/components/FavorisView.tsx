'use client'
import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { signalerFavori } from '@/hooks/useFavori'
import { EvenementCard } from '@/lib/types'
import { formatEventDate } from '@/lib/filters'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import PushPromptModal, { pushDejaAccepte } from '@/components/PushPromptModal'
import ClientPortal from '@/components/ClientPortal'
import { useAnnonceFavorites } from '@/hooks/useAnnonceFavorites'
import { authedFetcher } from '@/lib/swr-fetchers'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import { getPrixAffiche, type Annonce } from '@/lib/annonces'

interface ProducerMin {
  id: string; nom: string; commune: string | null; photos: string[]; produit_categories: string[]
}
interface EtabMin {
  id: string; nom: string; commune: string | null; photos: string[]; type: string
}

interface Props {
  events: EvenementCard[]
  onToggleFav: (id: string) => void
  onOpenProducer?: (id: string) => void
  onOpenEtablissement?: (id: string) => void
  onBack?: () => void
}

type Section = 'favoris' | 'suivis'
type FavoSub = 'all' | 'annonces' | 'events' | 'producteurs' | 'commerces' | 'promos'
type SuivisSub = 'all' | 'producteurs' | 'commerces'

interface PromoMin { id: string; title: string; image: string | null; etabNom: string | null }

const CAT_TAG = {
  annonce:    { label: 'ANNONCE',    bg: '#FFF0E5', color: '#C84B2F' },
  event:      { label: 'ÉVÉNEMENT',  bg: '#E8EEF7', color: '#3A5D8C' },
  producteur: { label: 'PRODUCTEUR', bg: '#E8F2EB', color: '#2D5A3D' },
  commerce:   { label: 'COMMERCE',   bg: '#FDE8DF', color: '#C0440A' },
  promo:      { label: 'PROMO',      bg: '#FFF0E5', color: '#E8622A' },
} as const

/* ── Icons SVG lineart (cohérents avec action bar évènement) ──────── */
const IcHeart = ({ size = 16, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IcBell = ({ size = 16, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  </svg>
)
const IcTag = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
)
const IcCalendar = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IcLeaf = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
    <path d="M2 21c0-3 1.85-5.36 5.08-6"/>
  </svg>
)
const IcStore = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l2-6h14l2 6"/>
    <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/>
    <path d="M3 9h18"/>
    <path d="M9 21V13h6v8"/>
  </svg>
)

export default function FavorisView({ events, onToggleFav, onOpenProducer, onOpenEtablissement, onBack }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { state: pushState, busy: pushBusy, enable: enablePush } = usePushNotifications()
  // Lu au montage seulement : localStorage n'existe pas au rendu serveur.
  const [pushDejaVu, setPushDejaVu] = useState(false)
  useEffect(() => { setPushDejaVu(pushDejaAccepte()) }, [])

  const [section, setSection]   = useState<Section>('favoris')
  const [favoSub, setFavoSub]   = useState<FavoSub>('all')
  const [suivisSub, setSuivisSub] = useState<SuivisSub>('all')

  /**
   * Change le moment du rappel d'un favori.
   *
   * Volontairement SANS revalidation après coup. Fermer la feuille de choix
   * redonne le focus, ce qui déclenche une revalidation de /api/favoris — qui
   * part avant que le PATCH n'ait abouti et rapporte donc l'ancienne valeur.
   * Et comme SWR dédoublonne les requêtes pendant 5 s, un `mutate()` final
   * serait fusionné avec elle plutôt que de relire. Le réglage semblait donc
   * revenir en arrière alors qu'il était bien enregistré.
   *
   * On pose la valeur nous-mêmes, on la remplace par celle que le serveur
   * confirme, et on revient en arrière si l'appel échoue.
   */
  async function changerRappel(eventId: string, jours: number) {
    setRappelEdit(null)
    const precedent = eventRappels[eventId] ?? 1
    const poser = (v: number) => mutate(
      d => (d ? { ...d, eventRappels: { ...(d.eventRappels ?? {}), [eventId]: v } } : d),
      { revalidate: false },
    )
    void poser(jours)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/evenements/${eventId}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ rappelJours: jours }),
    }).catch(() => null)

    if (!res?.ok) {
      void poser(precedent)
      toast.error('Le rappel n’a pas pu être modifié.')
      return
    }
    // Le serveur borne la valeur : on affiche ce qu'il a réellement retenu.
    const body = await res.json().catch(() => null)
    if (typeof body?.rappelJours === 'number' && body.rappelJours !== jours) void poser(body.rappelJours)
  }

  const favKey = !authLoading && user ? '/api/favoris' : null
  const { data, isLoading, mutate } = useSWR<{
    producerFavs: ProducerMin[]; producerFollows: ProducerMin[];
    etabFavs: EtabMin[]; etabFollows: EtabMin[]; promoFavs: PromoMin[];
    eventRappels: Record<string, number>;
  }>(favKey, authedFetcher)
  const producerFavs    = data?.producerFavs    ?? []
  const producerFollows = data?.producerFollows ?? []
  const etabFavs        = data?.etabFavs        ?? []
  const etabFollows     = data?.etabFollows     ?? []
  const promoFavs       = data?.promoFavs       ?? []
  const eventRappels    = data?.eventRappels    ?? {}
  /** Événement dont on est en train de changer le moment du rappel. */
  const [rappelEdit, setRappelEdit] = useState<{ id: string; titre: string } | null>(null)
  const loading = isLoading && !data

  const removeProducerFav = (id: string) =>
    mutate(prev => prev ? { ...prev, producerFavs: prev.producerFavs.filter(x => x.id !== id) } : prev, false)
  const removeEtabFav = (id: string) =>
    mutate(prev => prev ? { ...prev, etabFavs: prev.etabFavs.filter(x => x.id !== id) } : prev, false)
  const removeProducerFollow = (id: string) =>
    mutate(prev => prev ? { ...prev, producerFollows: prev.producerFollows.filter(x => x.id !== id) } : prev, false)
  const removeEtabFollow = (id: string) =>
    mutate(prev => prev ? { ...prev, etabFollows: prev.etabFollows.filter(x => x.id !== id) } : prev, false)
  const removePromoFav = (id: string) =>
    mutate(prev => prev ? { ...prev, promoFavs: prev.promoFavs.filter(x => x.id !== id) } : prev, false)

  const { favIds: annonceFavIds, toggle: toggleAnnonceFav } = useAnnonceFavorites()
  /**
   * On recharge dès qu'un favori change AILLEURS dans l'application : une
   * fiche gardée depuis l'assistant, depuis une fiche établissement ou depuis
   * les bons plans doit apparaître ici sans qu'on ait à rouvrir l'écran.
   * Cet onglet reste monté, donc rien ne le rafraîchissait de lui-même.
   */
  useEffect(() => {
    const onFavori = () => { void mutate() }
    window.addEventListener('lpv:favori', onFavori)
    return () => window.removeEventListener('lpv:favori', onFavori)
  }, [mutate])

  const { data: annoncesData } = useSWR<{ annonces: Annonce[] }>(
    user && annonceFavIds.length > 0 ? '/api/annonces/public' : null,
  )
  const annonceFavs = useMemo(
    () => ((annoncesData?.annonces ?? []) as Annonce[]).filter(a => annonceFavIds.includes(a.id)),
    [annoncesData, annonceFavIds],
  )

  // ── Compteurs ────────────────────────────────────────────────────────
  const favoCounts = {
    all:          annonceFavs.length + events.length + producerFavs.length + etabFavs.length + promoFavs.length,
    annonces:     annonceFavs.length,
    events:       events.length,
    producteurs:  producerFavs.length,
    commerces:    etabFavs.length,
    promos:       promoFavs.length,
  }
  const suivisCounts = {
    all:          producerFollows.length + etabFollows.length,
    producteurs:  producerFollows.length,
    commerces:    etabFollows.length,
  }

  // ── Rows à afficher : on construit une liste plate uniforme ────────
  const rows = useMemo(() => {
    if (section === 'favoris') {
      const out: RowItem[] = []
      if (favoSub === 'all' || favoSub === 'annonces') {
        for (const a of annonceFavs) out.push(annonceToRow(a, () => toggleAnnonceFav(a.id)))
      }
      if (favoSub === 'all' || favoSub === 'events') {
        for (const e of events) out.push(eventToRow(
          e,
          () => onToggleFav(e.id),
          eventRappels[e.id] ?? 1,
          () => setRappelEdit({ id: e.id, titre: e.titre }),
        ))
      }
      if (favoSub === 'all' || favoSub === 'producteurs') {
        for (const p of producerFavs) {
          out.push(producerFavToRow(p,
            () => onOpenProducer?.(p.id),
            async () => {
              await supabase.from('producer_favorites').delete().eq('producer_id', p.id).eq('user_id', user!.id)
              removeProducerFav(p.id)
            },
          ))
        }
      }
      if (favoSub === 'all' || favoSub === 'commerces') {
        for (const e of etabFavs) {
          out.push(etabFavToRow(e,
            () => onOpenEtablissement?.(e.id),
            async () => {
              await supabase.from('etablissement_favorites').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
              removeEtabFav(e.id)
            },
          ))
        }
      }
      if (favoSub === 'all' || favoSub === 'promos') {
        for (const p of promoFavs) {
          out.push(promoFavToRow(p,
            () => { if (typeof window !== 'undefined') window.location.href = `/promotions?id=${p.id}` },
            async () => {
              const { data: { session } } = await supabase.auth.getSession()
              await fetch(`/api/promotions/${p.id}/favorite`, { method: 'POST', headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
              signalerFavori('promo', p.id, false)
              removePromoFav(p.id)
            },
          ))
        }
      }
      return out
    }
    // section === 'suivis'
    const out: RowItem[] = []
    if (suivisSub === 'all' || suivisSub === 'producteurs') {
      for (const p of producerFollows) {
        out.push(producerFollowToRow(p,
          () => onOpenProducer?.(p.id),
          async () => {
            await supabase.from('producer_followers').delete().eq('producer_id', p.id).eq('user_id', user!.id)
            removeProducerFollow(p.id)
          },
        ))
      }
    }
    if (suivisSub === 'all' || suivisSub === 'commerces') {
      for (const e of etabFollows) {
        out.push(etabFollowToRow(e,
          () => onOpenEtablissement?.(e.id),
          async () => {
            await supabase.from('etablissement_followers').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
            removeEtabFollow(e.id)
          },
        ))
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, favoSub, suivisSub, annonceFavs, events, producerFavs, etabFavs, promoFavs, producerFollows, etabFollows, eventRappels])

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* ── Top bar ──────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2.5 px-4 pt-3.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}
      >
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Retour"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border bg-white text-texte"
            style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        ) : <div className="h-10 w-10 shrink-0" />}
        <div className="font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.005em' }}>
          Mes favoris
        </div>
        <div className="h-10 w-10 shrink-0" />
      </div>

      {/* ── 2 grandes sections : Favoris / Suivis ───────────────────── */}
      <div className="px-4 pt-3.5">
        <div className="grid grid-cols-2 gap-1 rounded-[14px] p-1" style={{ background: '#F7F1E6' }}>
          {([
            { id: 'favoris' as Section, label: 'Favoris', color: '#C84B2F', count: favoCounts.all },
            { id: 'suivis'  as Section, label: 'Suivis',  color: '#2D5A3D', count: suivisCounts.all },
          ]).map(s => {
            const active = section === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className="flex items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[13.5px]"
                style={{
                  background: active ? '#FFFFFF' : 'transparent',
                  boxShadow:  active ? '0 1px 3px rgba(44,28,16,0.10)' : 'none',
                  color:      active ? '#1A1209' : '#7A6A5A',
                  fontWeight: active ? 800 : 700,
                  letterSpacing: '-0.005em',
                }}
              >
                <span style={{ color: active ? s.color : '#7A6A5A', display: 'inline-flex' }}>
                  {s.id === 'favoris' ? <IcHeart size={16} filled={active} /> : <IcBell size={16} filled={active} />}
                </span>
                <span>{s.label}</span>
                {s.count > 0 && (
                  <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold"
                    style={{ background: active ? '#F7F1E6' : 'transparent', color: active ? '#7A6A5A' : '#A99B89' }}>
                    {s.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Pills sous-catégories (flex-wrap, style messagerie) ─────── */}
      {section === 'favoris' && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
          <CatPill active={favoSub === 'all'}         onClick={() => setFavoSub('all')}         label="Toutes"      count={favoCounts.all} />
          <CatPill active={favoSub === 'annonces'}    onClick={() => setFavoSub('annonces')}    label="Annonces"    count={favoCounts.annonces} />
          <CatPill active={favoSub === 'events'}      onClick={() => setFavoSub('events')}      label="Événements"  count={favoCounts.events} />
          <CatPill active={favoSub === 'producteurs'} onClick={() => setFavoSub('producteurs')} label="Producteurs" count={favoCounts.producteurs} />
          <CatPill active={favoSub === 'commerces'}   onClick={() => setFavoSub('commerces')}   label="Commerces"   count={favoCounts.commerces} />
          <CatPill active={favoSub === 'promos'}      onClick={() => setFavoSub('promos')}      label="Promotions"  count={favoCounts.promos} />
        </div>
      )}
      {section === 'suivis' && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
          <CatPill active={suivisSub === 'all'}         onClick={() => setSuivisSub('all')}         label="Tous"        count={suivisCounts.all} />
          <CatPill active={suivisSub === 'producteurs'} onClick={() => setSuivisSub('producteurs')} label="Producteurs" count={suivisCounts.producteurs} />
          <CatPill active={suivisSub === 'commerces'}   onClick={() => setSuivisSub('commerces')}   label="Commerces"   count={suivisCounts.commerces} />
        </div>
      )}

      {/* Invitation fixe à activer les notifications — pas une pop-up : elle
          reste là tant que ce n'est pas fait, sans jamais interrompre. Ne
          s'affiche que si le push est possible et pas encore activé (donc
          jamais chez quelqu'un qui a refusé au niveau du navigateur). */}
      {user && section === 'favoris' && !pushDejaVu && (pushState === 'off' || pushState === 'ios-needs-install') && (
        <div
          className="mx-4 mt-3.5 flex items-center gap-3 rounded-[14px] border p-3"
          style={{ borderColor: '#F0D4C8', background: '#FFF6EF' }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: '#FFE6D6', color: '#C0440A' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-texte">
              {pushState === 'ios-needs-install' ? "Installez l'app pour les rappels" : 'Recevez vos rappels'}
            </div>
            <div className="mt-[2px] text-[11.5px] leading-snug text-texte-doux">
              {pushState === 'ios-needs-install'
                ? "Ajoutez La Place du Village à votre écran d'accueil pour être prévenu la veille."
                : 'Votre téléphone vous prévient la veille de vos événements favoris.'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (pushState === 'ios-needs-install') { window.location.href = '/app'; return } void enablePush() }}
            disabled={pushBusy}
            className="shrink-0 rounded-full border-none px-3.5 py-2 text-[12px] font-extrabold text-white"
            style={{ background: '#C14A2B', opacity: pushBusy ? 0.6 : 1 }}
          >
            {pushBusy ? '…' : pushState === 'ios-needs-install' ? 'Installer' : 'Activer'}
          </button>
        </div>
      )}

      {/* ── Liste plate uniforme (style messagerie) ─────────────────── */}
      <div className="pt-3.5">
        {!user && (
          <div className="mx-4 rounded-[14px] border bg-white p-6 text-center" style={{ borderColor: '#F0EAE0' }}>
            <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">Connexion requise</p>
            <p className="m-0 text-[12px] text-texte-doux">Connecte-toi pour voir tes favoris et suivis.</p>
          </div>
        )}
        {user && loading && <p className="px-4 py-6 text-center text-[12px] text-texte-doux">Chargement…</p>}
        {user && !loading && rows.length === 0 && (
          <div className="mx-4 rounded-[14px] border bg-white p-6 text-center" style={{ borderColor: '#F0EAE0' }}>
            <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">
              {section === 'favoris' ? 'Aucun favori' : 'Aucun abonnement'}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              {section === 'favoris'
                ? 'Appuie sur le cœur d\'une annonce, d\'un événement, d\'un producteur ou d\'un commerce pour le retrouver ici.'
                : 'Suis des producteurs et commerces pour ne rien rater.'}
            </p>
          </div>
        )}
        {user && !loading && rows.map(r => <Row key={r.key} row={r} />)}
      </div>

      {/* Choix du moment du rappel, pour un favori */}
      {rappelEdit && (
        <ClientPortal>
          <div
            onClick={() => setRappelEdit(null)}
            className="fixed inset-0 z-[3400] flex items-end justify-center"
            style={{ background: 'rgba(26,18,9,0.5)' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="w-full max-w-[460px] rounded-t-[22px] bg-white px-4 pb-8 pt-4"
            >
              <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: '#D1CCC4' }} />
              <p className="m-0 mb-1 text-center text-[14px] font-extrabold text-texte">Me rappeler…</p>
              <p className="m-0 mb-3 truncate text-center text-[12px] text-texte-doux">{rappelEdit.titre}</p>
              <div className="flex flex-col gap-1.5">
                {RAPPEL_OPTIONS.map(o => {
                  const actif = (eventRappels[rappelEdit.id] ?? 1) === o.jours
                  return (
                    <button
                      key={o.jours}
                      type="button"
                      onClick={() => changerRappel(rappelEdit.id, o.jours)}
                      className="flex items-center justify-between rounded-[12px] border px-3.5 py-3 text-[13.5px] font-bold"
                      style={{
                        borderColor: actif ? '#C8DEC0' : '#F0EAE0',
                        background:  actif ? '#E8F2EB' : '#FDFAF5',
                        color:       actif ? '#2D5A3D' : '#1A1209',
                      }}
                    >
                      {o.label}
                      {actif && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Demande d'activation — même composant que partout ailleurs, donc même
          report de 12 jours et même respect d'un refus délibéré. Le bandeau
          fixe ci-dessus prend le relais entre deux apparitions. */}
      {user && <PushPromptModal delayMs={1800} />}
    </main>
  )
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Row model uniforme — pattern ConvoRow de la messagerie unifiée        */
/* ─────────────────────────────────────────────────────────────────────── */

interface RowItem {
  key:       string
  href?:     string
  onClick?:  () => void
  onRemove?: () => void
  removeKind: 'heart' | 'bell'
  imageUrl:  string | null
  imageBg:   string
  /** Icône SVG rendue dans le placeholder si pas d'imageUrl. */
  fallbackIcon: React.ReactNode
  /** Couleur de l'icône placeholder (assortie à la catégorie). */
  fallbackColor: string
  tag:       { label: string; bg: string; color: string }
  title:     string
  subtitle:  string
  /** Pastille de droite (compte à rebours du rappel, pour les événements). */
  badge?:    { label: string; bg: string; color: string }
  /** Rend la pastille cliquable — pour changer le délai de rappel. */
  onBadgeClick?: () => void
}

function annonceToRow(a: Annonce, onRemove: () => void): RowItem {
  return {
    key:       `annonce-${a.id}`,
    href:      `/annonces/${a.id}`,
    onRemove,
    removeKind: 'heart',
    imageUrl:  a.photos?.[0] ?? null,
    imageBg:   '#FFF0E5',
    fallbackIcon:  <IcTag size={22} />,
    fallbackColor: '#C84B2F',
    tag:       CAT_TAG.annonce,
    title:     a.titre,
    subtitle:  `${getPrixAffiche(a)}${a.ville ? ' • ' + a.ville : ''}`,
  }
}

/**
 * Délais de rappel proposés. La valeur est un nombre de jours avant
 * l'événement, sauf -1 qui vaut « 2 h avant » — le seul réglage qui ne
 * s'exprime pas en jours (voir le cron, qui tourne à l'heure pour lui).
 */
export const RAPPEL_2H = -1
export const RAPPEL_OPTIONS: { jours: number; label: string; court: string }[] = [
  { jours: RAPPEL_2H, label: '2 h avant',         court: '2 h avant' },
  { jours: 1,         label: 'La veille',         court: 'la veille' },
  { jours: 2,         label: '2 jours avant',     court: '2 j avant' },
  { jours: 3,         label: '3 jours avant',     court: '3 j avant' },
  { jours: 7,         label: 'Une semaine avant', court: '1 sem. avant' },
]

/**
 * Compte à rebours d'un événement en favori.
 *
 * Purement calculé à l'affichage depuis `date_debut` : aucun appel serveur,
 * aucune donnée stockée, et volontairement PAS de minuterie à la seconde —
 * un rafraîchissement par seconde sur une liste ne dirait rien de plus et
 * ferait travailler le téléphone pour rien.
 *
 * Le rappel part la veille : c'est ce que la pastille annonce.
 */
/**
 * Pastille de rappel d'un événement en favori.
 *
 * Elle affiche LE RÉGLAGE, pas un compte à rebours. C'est un bouton qui ouvre
 * le choix : un contrôle doit montrer sa propre valeur. Afficher l'échéance
 * calculée (« rappel dans 3 j ») était exact mais illisible — on ne
 * reconnaissait pas ce qu'on venait de choisir.
 */
function rappelBadge(dateDebut?: string | null, rappelJours = 1): RowItem['badge'] {
  if (!dateDebut) return undefined
  const auj = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const jours = Math.round(
    (Date.parse(`${dateDebut}T12:00:00Z`) - Date.parse(`${auj}T12:00:00Z`)) / 86_400_000,
  )
  if (jours < 0) return undefined   // passé : plus rien à rappeler

  const opt = RAPPEL_OPTIONS.find(o => o.jours === rappelJours)
  const label = opt?.court ?? `${rappelJours} j avant`
  // Orange quand le rappel tombe aujourd'hui ou est déjà passé : c'est
  // imminent. Vert sinon.
  const imminent = rappelJours === RAPPEL_2H ? jours === 0 : jours - rappelJours <= 0
  return imminent
    ? { label, bg: '#FFF0E5', color: '#C84B2F' }
    : { label, bg: '#E8F2EB', color: '#2D5A3D' }
}

function eventToRow(e: EvenementCard, onRemove: () => void, rappelJours = 1, onEditRappel?: () => void): RowItem {
  const date = e.date_debut ? formatEventDate(e.date_debut, e.date_fin) : ''
  const commune = e.lieux?.commune ?? ''
  return {
    key:       `event-${e.id}`,
    href:      `/evenement/${e.id}`,
    onRemove,
    removeKind: 'heart',
    imageUrl:  e.image_url ?? null,
    imageBg:   '#E8EEF7',
    fallbackIcon:  <IcCalendar size={22} />,
    fallbackColor: '#3A5D8C',
    tag:       CAT_TAG.event,
    title:     e.titre,
    subtitle:  [date, commune].filter(Boolean).join(' • '),
    badge:     rappelBadge(e.date_debut, rappelJours),
    onBadgeClick: onEditRappel,
  }
}

function producerFavToRow(p: ProducerMin, onClick: () => void, onRemove: () => void): RowItem {
  return {
    key:       `producteur-fav-${p.id}`,
    onClick,
    onRemove,
    removeKind: 'heart',
    imageUrl:  p.photos?.[0] ?? null,
    imageBg:   '#E8F2EB',
    fallbackIcon:  <IcLeaf size={22} />,
    fallbackColor: '#2D5A3D',
    tag:       CAT_TAG.producteur,
    title:     p.nom,
    subtitle:  p.commune ?? '',
  }
}

function producerFollowToRow(p: ProducerMin, onClick: () => void, onRemove: () => void): RowItem {
  return {
    key:       `producteur-follow-${p.id}`,
    onClick,
    onRemove,
    removeKind: 'bell',
    imageUrl:  p.photos?.[0] ?? null,
    imageBg:   '#E8F2EB',
    fallbackIcon:  <IcLeaf size={22} />,
    fallbackColor: '#2D5A3D',
    tag:       CAT_TAG.producteur,
    title:     p.nom,
    subtitle:  p.commune ?? '',
  }
}

function promoFavToRow(p: PromoMin, onClick: () => void, onRemove: () => void): RowItem {
  return {
    key:       `promo-fav-${p.id}`,
    onClick,
    onRemove,
    removeKind: 'heart',
    imageUrl:  p.image ?? null,
    imageBg:   '#FFF0E5',
    fallbackIcon:  <IcTag size={22} />,
    fallbackColor: '#E8622A',
    tag:       CAT_TAG.promo,
    title:     p.title,
    subtitle:  p.etabNom ?? 'Bon plan',
  }
}

function etabFavToRow(e: EtabMin, onClick: () => void, onRemove: () => void): RowItem {
  const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
  return {
    key:       `commerce-fav-${e.id}`,
    onClick,
    onRemove,
    removeKind: 'heart',
    imageUrl:  e.photos?.[0] ?? null,
    imageBg:   typeInfo?.bg ?? '#FDE8DF',
    fallbackIcon:  <IcStore size={22} />,
    fallbackColor: '#C0440A',
    tag:       CAT_TAG.commerce,
    title:     e.nom,
    subtitle:  `${typeInfo?.label ?? e.type}${e.commune ? ' · ' + e.commune : ''}`,
  }
}

function etabFollowToRow(e: EtabMin, onClick: () => void, onRemove: () => void): RowItem {
  const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
  return {
    key:       `commerce-follow-${e.id}`,
    onClick,
    onRemove,
    removeKind: 'bell',
    imageUrl:  e.photos?.[0] ?? null,
    imageBg:   typeInfo?.bg ?? '#FDE8DF',
    fallbackIcon:  <IcStore size={22} />,
    fallbackColor: '#C0440A',
    tag:       CAT_TAG.commerce,
    title:     e.nom,
    subtitle:  `${typeInfo?.label ?? e.type}${e.commune ? ' · ' + e.commune : ''}`,
  }
}

/* ── Pill catégorie (style messagerie unifiée) ─────────────────────── */
function CatPill({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-[7px] text-[12px] font-bold"
      style={{
        background: active ? '#1A1209' : '#FFFFFF',
        color: active ? '#FDFAF5' : '#1A1209',
        borderColor: active ? '#1A1209' : '#E8E0D4',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span className="text-[10px] font-extrabold" style={{ opacity: active ? 0.85 : 0.7 }}>
        {count}
      </span>
    </button>
  )
}

/* ── Row uniforme (pattern ConvoRow messagerie) ────────────────────── */
function Row({ row }: { row: RowItem }) {
  const content = (
    <div
      className="flex w-full items-center gap-[11px] bg-transparent px-4 py-3 text-inherit no-underline"
      style={{ borderBottom: '1px solid #F0EAE0', cursor: 'pointer' }}
      onClick={row.onClick}
    >
      {/* Avatar / miniature 48px */}
      {row.imageUrl ? (
        <img
          src={row.imageUrl}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-[12px] object-cover"
          style={{ border: '2px solid #FDFAF5', background: row.imageBg }}
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: row.imageBg, border: '2px solid #FDFAF5', color: row.fallbackColor }}
        >
          {row.fallbackIcon}
        </div>
      )}

      {/* Bloc texte */}
      <div className="min-w-0 flex-1 pt-[1px]">
        <div className="mb-[3px]">
          <span
            className="inline-block rounded-[5px] px-[6px] py-[2px] text-[8.5px] font-extrabold uppercase"
            style={{ background: row.tag.bg, color: row.tag.color, letterSpacing: '0.06em' }}
          >
            {row.tag.label}
          </span>
        </div>
        <div className="truncate text-[14px] font-bold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {row.title}
        </div>
        {row.subtitle && (
          <div className="mt-[2px] truncate text-[12px] text-texte-doux">{row.subtitle}</div>
        )}
      </div>

      {/* Compte à rebours du rappel (événements à venir uniquement) */}
      {row.badge && (
        row.onBadgeClick ? (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); row.onBadgeClick?.() }}
            aria-label="Changer le moment du rappel"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-none px-2 py-[4px] text-[10px] font-extrabold"
            style={{ background: row.badge.bg, color: row.badge.color }}
          >
            {row.badge.label}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        ) : (
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-extrabold"
            style={{ background: row.badge.bg, color: row.badge.color }}
          >
            {row.badge.label}
          </span>
        )
      )}

      {/* Bouton remove (cœur fill rouge ou cloche) */}
      {row.onRemove && (
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); row.onRemove?.() }}
          aria-label={row.removeKind === 'heart' ? 'Retirer des favoris' : 'Ne plus suivre'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none"
          style={{
            background: row.removeKind === 'heart' ? '#FFF0E5' : '#E8F2EB',
            color:      row.removeKind === 'heart' ? '#C84B2F' : '#2D5A3D',
          }}
        >
          {row.removeKind === 'heart' ? <IcHeart size={16} filled /> : <IcBell size={16} filled />}
        </button>
      )}
    </div>
  )

  return row.href ? <Link href={row.href} className="block no-underline">{content}</Link> : content
}
