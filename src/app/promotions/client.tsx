'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import SubscriptionModal from '@/components/SubscriptionModal'
import QuotaPromoModal from '@/components/QuotaPromoModal'
import { PromotionForm } from '@/components/PromotionsManager'
import FeatureButton from '@/components/FeatureButton'
import type { Plan } from '@/lib/capabilities'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import type { EtablissementType } from '@/lib/types'
import EntityQuickView from '@/components/EntityQuickView'
import BottomNavBar from '@/components/BottomNavBar'
import { shareLink } from '@/lib/share'

interface Promotion {
  id: string
  title: string
  description: string | null
  image_url: string | null
  display_image_url: string | null
  conditions: string | null
  frequency: 'always' | 'weekly' | 'monthly'
  valid_from: string | null
  valid_until: string | null
  use_count: number
  etablissement: {
    id: string
    nom: string
    commune: string | null
    photos: string[] | null
    type: EtablissementType | null
    lat?: number | null
    lng?: number | null
  } | null
}

const FREQ_LABEL: Record<string, string> = {
  always:  'Toujours',
  weekly:  '1× par semaine',
  monthly: '1× par mois',
}

export default function PromotionsClient() {
  const router = useRouter()
  const { user, profile, isAdmin } = useAuth()
  const { openAuthModal } = useAuthModal()
  const currentPlan = (profile?.plan as Plan) ?? 'basic'

  const [using, setUsing] = useState<string | null>(null)
  const [upgradePromo, setUpgradePromo] = useState<Promotion | null>(null)
  const [typeFilter, setTypeFilter] = useState<EtablissementType | null>(null)
  const [confirmModal, setConfirmModal] = useState<Promotion | null>(null)
  const [discoverModal, setDiscoverModal] = useState<Promotion | null>(null)
  const [editPromo, setEditPromo] = useState<Promotion | null>(null)   // admin : édition depuis Découvrir
  const [usedThisMonth, setUsedThisMonth] = useState<number>(0)
  const [showQuotaUpgrade, setShowQuotaUpgrade] = useState(false)
  const [favIds, setFavIds] = useState<Set<string>>(new Set())

  // Favoris promos de l'user (cœur)
  useEffect(() => {
    if (!user) { setFavIds(new Set()); return }
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const r = await fetch('/api/profile/promo-favorites', { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
      if (r && r.ok) { const d = await r.json(); setFavIds(new Set(d.ids ?? [])) }
    })()
  }, [user])

  const toggleFav = useCallback(async (promoId: string) => {
    if (!user) { openAuthModal('/promotions'); return }
    const wasFav = favIds.has(promoId)
    setFavIds(prev => { const n = new Set(prev); if (wasFav) n.delete(promoId); else n.add(promoId); return n })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const r = await fetch(`/api/promotions/${promoId}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
    if (!r || !r.ok) {
      setFavIds(prev => { const n = new Set(prev); if (wasFav) n.add(promoId); else n.delete(promoId); return n })  // revert
    }
  }, [user, openAuthModal, favIds])

  // Compteur de promos utilisées sur le mois calendaire en cours
  const refreshUsedThisMonth = useCallback(async () => {
    if (!user) { setUsedThisMonth(0); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const r = await fetch('/api/profile/promotions-used', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!r.ok) return
    const d = await r.json()
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    const count = (d.uses ?? []).filter((u: { used_at: string }) => new Date(u.used_at) >= start).length
    setUsedThisMonth(count)
  }, [user])

  useEffect(() => { refreshUsedThisMonth() }, [refreshUsedThisMonth])

  // SWR sur /api/promotions (mode public, sans mine ni etab) → cache CDN 60s
  // + mémoire client. Retour sur la page = instantané. Le refetch après
  // utilisation d'une promo se fait via mutatePromos().
  const { data: promoData, isLoading: promoLoading, mutate: mutatePromos } = useSWR('/api/promotions')
  // useMemo pour stabiliser la référence array (évite cascades useMemo aval).
  const promos = useMemo<Promotion[]>(() => (promoData?.promotions ?? []) as Promotion[], [promoData])
  const loading = promoLoading && !promoData
  const fetchPromos = mutatePromos  // alias pour rester compat avec les callers existants

  // Réglage carrousel (ordre admin + coup de cœur)
  const { data: carouselCfg, mutate: mutateCarousel } = useSWR<{ order: string[]; coupDeCoeur: string | null }>('/api/promo-carousel')
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const carouselOrder = useMemo(() => carouselCfg?.order ?? [], [carouselCfg])
  const coupDeCoeur = carouselCfg?.coupDeCoeur ?? null

  // Scroll vers la promo ciblée si on arrive depuis le hub avec ?id=...
  useEffect(() => {
    if (loading || promos.length === 0) return
    if (typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) return
    const el = document.getElementById(`promo-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.style.outline = '3px solid #E8622A'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '18px'
      setTimeout(() => {
        el.style.outline = ''
        el.style.outlineOffset = ''
      }, 2000)
    }
  }, [loading, promos.length])

  // Checkout direct plan Habitant (CTA de la modal quota promo).
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  async function goCheckoutHabitants() {
    setCheckoutLoading(true)
    try {
      await supabase.auth.refreshSession()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { openAuthModal('/promotions'); setCheckoutLoading(false); return }
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: 'habitants' }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      toast.error(data.error ?? 'Une erreur est survenue, réessaie.')
    } catch { toast.error('Impossible de contacter le serveur.') }
    setCheckoutLoading(false)
  }

  // Étape 1 : clic "J'en profite" → ouvre la modale de confirmation position.
  const openUseConfirm = (promo: Promotion) => {
    if (!user) { openAuthModal('/promotions'); return }
    setConfirmModal(promo)
  }

  // Étape 2 : user confirme qu'il est sur place → POST API
  const confirmUse = async (promo: Promotion) => {
    setUsing(promo.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUsing(null); return }
    const res = await fetch(`/api/promotions/${promo.id}/use`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setUsing(null)
    setConfirmModal(null)
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success('Promo enregistrée')
      fetchPromos()
      refreshUsedThisMonth()
    } else if (d.upgradeRequired) {
      setUpgradePromo(promo)
    } else {
      toast.error(d.error ?? 'Erreur')
    }
  }

  const filteredPromos = useMemo(() => {
    if (!typeFilter) return promos
    return promos.filter(p => p.etablissement?.type === typeFilter)
  }, [promos, typeFilter])

  const availableTypes = useMemo(() => {
    const set = new Set<EtablissementType>()
    promos.forEach(p => { if (p.etablissement?.type) set.add(p.etablissement.type) })
    return Array.from(set)
  }, [promos])

  return (
    <div className="min-h-[100dvh] bg-creme pb-20 font-inter text-texte">
      <style>{`.pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; } .pdv-hscroll::-webkit-scrollbar { display: none; }`}</style>

      {/* Top bar : logo + partager */}
      <div className="flex items-center justify-between gap-2.5 px-3.5 pt-[max(12px,env(safe-area-inset-top,12px))]">
        <button
          onClick={() => router.push('/')}
          aria-label="Accueil La Place du Village"
          className="shrink-0 border-none bg-transparent p-0"
          style={{ lineHeight: 0, cursor: 'pointer' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/splash-logo-v4.png" alt="La Place du Village" style={{ height: 40, width: 'auto', objectFit: 'contain', display: 'block' }} />
        </button>
        <button
          type="button"
          onClick={() => shareLink({
            title: 'Bons plans — La Place du Village',
            text:  'Découvre les bons plans du village autour de Ganges.',
            url:   'https://laplaceduvillage.app/promotions',
          })}
          aria-label="Partager les bons plans"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      </div>

      {/* Titre */}
      <div className="px-4 pt-3.5">
        <h1 className="m-0 font-serif text-[23px] leading-tight text-texte" style={{ letterSpacing: '-0.01em' }}>
          Les bons plans du moment
        </h1>
        <p className="m-0 mt-1 text-[13px] text-texte-doux">Des offres exclusives près de chez vous.</p>
      </div>

      {/* Intro strip : compteur + En direct */}
      <div className="flex items-baseline justify-between gap-2.5 px-4 pt-2.5">
        <p className="m-0 flex-1 text-[13px] text-texte-doux">
          {loading ? (
            'Chargement des offres…'
          ) : (
            <>
              <span className="font-bold text-texte">{promos.length} offre{promos.length > 1 ? 's' : ''}</span>{' '}
              exclusive{promos.length > 1 ? 's' : ''} chez vos commerçants locaux.
            </>
          )}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#FFF0E5] px-[9px] py-1 text-[11px] font-bold text-accent">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          En direct
        </span>
      </div>

      {/* Bandeau quota / rappel plan */}
      <QuotaBanner
        user={user}
        plan={currentPlan}
        isAdmin={isAdmin}
        usedThisMonth={usedThisMonth}
        onLogin={() => openAuthModal('/promotions')}
        onUpgrade={() => setShowQuotaUpgrade(true)}
      />

      {/* Filtres */}
      {!loading && availableTypes.length > 1 && (
        <div
          className="pdv-hscroll flex gap-1.5 overflow-x-auto px-4 pb-1 pt-3.5"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          <button
            onClick={() => setTypeFilter(null)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-bold transition-colors ${
              typeFilter === null
                ? 'border-[1.5px] border-accent bg-[#FFF0E5] text-accent'
                : 'border border-bord bg-white text-texte-doux'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            Tout
          </button>
          {availableTypes.map(t => {
            const info = ETAB_TYPES[t]
            const active = typeFilter === t
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-bold transition-colors ${
                  active
                    ? 'border-[1.5px] border-accent bg-[#FFF0E5] text-accent'
                    : 'border border-bord bg-white text-texte-doux'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                {info.label}
              </button>
            )
          })}
          <div className="w-1 shrink-0" aria-hidden />
        </div>
      )}

      {/* Featured carousel — À ne pas manquer (ordre admin + coup de cœur) */}
      {!loading && filteredPromos.length > 0 && (() => {
        // Ordre admin : les promos rangées en premier (dans l'ordre choisi),
        // puis le reste par date (ordre actuel de filteredPromos).
        const idxOf = (id: string) => { const i = carouselOrder.indexOf(id); return i === -1 ? Infinity : i }
        const ordered = [...filteredPromos].sort((a, b) => idxOf(a.id) - idxOf(b.id))
        return (
          <FeaturedPromoCarousel
            promos={ordered.slice(0, Math.min(5, ordered.length))}
            coupDeCoeur={coupDeCoeur}
            isAdmin={isAdmin}
            onEditOrder={() => setOrderModalOpen(true)}
            onUse={openUseConfirm}
          />
        )
      })()}

      {/* Section header */}
      <div className="flex items-center justify-between gap-2.5 px-4 pb-2.5 pt-[22px]">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="m-0 text-[15px] font-extrabold tracking-tight2 text-texte">
            Toutes les offres
          </h3>
          {!loading && (
            <span className="rounded-full bg-cremeDeep px-[7px] py-0.5 text-[11px] font-bold text-texte-doux">
              {filteredPromos.length}
            </span>
          )}
        </div>
      </div>

      {/* Grid 2 cols */}
      <div className="px-4">
        {loading ? (
          <div className="py-10 text-center text-[13px] text-texte-doux">Chargement…</div>
        ) : filteredPromos.length === 0 ? (
          <div className="py-14 text-center">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C8B8A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
            <p className="m-0 text-[14px] font-bold text-texte-doux">
              {typeFilter ? 'Aucune promo dans cette catégorie' : 'Aucune promo en cours'}
            </p>
            <p className="mt-1.5 text-[12px] text-texte-doux">
              {typeFilter
                ? <button onClick={() => setTypeFilter(null)} className="cursor-pointer border-none bg-transparent text-[12px] text-accent underline">Voir toutes les catégories</button>
                : 'Reviens plus tard, les commerçants en publient régulièrement'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredPromos.map(p => (
              <div key={p.id} id={`promo-${p.id}`} className="relative" style={{ scrollMarginTop: 80 }}>
                {isAdmin && (
                  <div className="absolute right-2 top-2 z-[5]">
                    <FeatureButton contentType="promotion" contentId={p.id} />
                  </div>
                )}
                <PromoCard
                  promo={p}
                  onUse={() => openUseConfirm(p)}
                  onDiscover={() => setDiscoverModal(p)}
                  disabled={using === p.id}
                  favorited={favIds.has(p.id)}
                  onToggleFav={() => toggleFav(p.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modale de confirmation */}
      {confirmModal && (
        <ConfirmPositionModal
          promo={confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirm={() => confirmUse(confirmModal)}
          loading={using === confirmModal.id}
        />
      )}

      {/* Modale Découvrir : encart promo + mini fiche etab + CTA J'en profite */}
      {discoverModal && (
        <DiscoverPromoModal
          promo={discoverModal}
          isAdmin={isAdmin}
          onEdit={() => { setEditPromo(discoverModal); setDiscoverModal(null) }}
          favorited={favIds.has(discoverModal.id)}
          onToggleFav={() => toggleFav(discoverModal.id)}
          onClose={() => setDiscoverModal(null)}
          onUse={() => { setDiscoverModal(null); openUseConfirm(discoverModal) }}
        />
      )}

      {/* Admin : édition d'une promo depuis « Découvrir » */}
      {editPromo && (
        <PromotionForm
          etablissementId={editPromo.etablissement?.id ?? ''}
          etablissementPhotos={editPromo.etablissement?.photos ?? []}
          promo={editPromo as unknown as Parameters<typeof PromotionForm>[0]['promo']}
          onClose={() => setEditPromo(null)}
          onSaved={() => { setEditPromo(null); fetchPromos() }}
        />
      )}

      {/* Admin : ordre du carrousel + coup de cœur */}
      {orderModalOpen && (
        <CarouselOrderModal
          promos={promos}
          initialOrder={carouselOrder}
          initialCoupDeCoeur={coupDeCoeur}
          onClose={() => setOrderModalOpen(false)}
          onSaved={() => { setOrderModalOpen(false); mutateCarousel() }}
        />
      )}

      {upgradePromo && (
        currentPlan === 'basic' ? (
          <QuotaPromoModal
            promoTitle={upgradePromo.title}
            promoWhere={upgradePromo.etablissement?.nom ?? ''}
            others={promos
              .filter(p => p.id !== upgradePromo.id)
              .slice(0, 8)
              .map(p => ({ title: p.title, where: p.etablissement?.nom ?? '', imageUrl: p.display_image_url ?? p.image_url ?? null }))}
            otherCount={promos.filter(p => p.id !== upgradePromo.id).length}
            loading={checkoutLoading}
            onSubscribe={goCheckoutHabitants}
            onClose={() => setUpgradePromo(null)}
          />
        ) : (
          <SubscriptionModal
            context={{ kind: 'promo', promoTitle: upgradePromo.title }}
            onClose={() => setUpgradePromo(null)}
            currentPlan={currentPlan}
          />
        )
      )}

      {showQuotaUpgrade && (
        <SubscriptionModal
          context={{ kind: 'promo' }}
          onClose={() => setShowQuotaUpgrade(false)}
          currentPlan={currentPlan}
        />
      )}
      <BottomNavBar />
    </div>
  )
}

function QuotaBanner({
  user, plan, isAdmin, usedThisMonth, onLogin, onUpgrade,
}: {
  user: unknown
  plan: Plan
  isAdmin: boolean
  usedThisMonth: number
  onLogin: () => void
  onUpgrade: () => void
}) {
  const isUnlimited = isAdmin || plan === 'habitants' || plan === 'pro'
  const isBasic = !!user && plan === 'basic' && !isAdmin
  const reached = isBasic && usedThisMonth >= 1

  // Cas 1 — non connecté : invite à se connecter pour profiter
  if (!user) {
    return (
      <button
        onClick={onLogin}
        className="mx-4 mt-2.5 flex w-[calc(100%-2rem)] items-center gap-2.5 rounded-xl border border-[#F0E2D2] bg-[#FFF8F0] px-3 py-2 text-left transition-colors active:bg-[#FFF1E2]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0E5] text-accent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
        <span className="min-w-0 flex-1 text-[11.5px] leading-[1.35] text-texte-doux">
          <strong className="text-texte">Connectez-vous</strong> pour profiter d&apos;1 promo offerte ce mois — ou passez Habitants pour des promos illimitées.
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    )
  }

  // Cas 2 — Habitants / Pro / Admin : rappel positif très discret
  if (isUnlimited) {
    return (
      <div className="mx-4 mt-2.5 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl border border-[#D6E5DC] bg-[#EEF7EF] px-3 py-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4A8B5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span className="text-[11px] font-semibold leading-tight text-[#2D5A3D]">
          Promos illimitées incluses dans votre abonnement.
        </span>
      </div>
    )
  }

  // Cas 3 — Basic : compteur + nudge upgrade
  return (
    <button
      onClick={onUpgrade}
      className={`mx-4 mt-2.5 flex w-[calc(100%-2rem)] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.99] ${
        reached
          ? 'border-[#F5C9A8] bg-[#FFF1E8]'
          : 'border-[#F0E2D2] bg-[#FFF8F0]'
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0E5] text-accent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
      </span>
      <span className="min-w-0 flex-1 text-[11.5px] leading-[1.35] text-texte-doux">
        {reached ? (
          <>
            <strong className="text-texte">Quota mensuel atteint</strong> — passez Habitants pour des promos illimitées.
          </>
        ) : (
          <>
            <strong className="text-texte">1 promo offerte / mois</strong> avec votre plan Villageois — Habitants pour profiter sans limite.
          </>
        )}
      </span>
      <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-bold text-white">
        Habitants
      </span>
    </button>
  )
}

function PromoCard({ promo, onUse, onDiscover, disabled, favorited, onToggleFav }: {
  promo: Promotion
  onUse: () => void
  onDiscover: () => void
  disabled: boolean
  favorited: boolean
  onToggleFav: () => void
}) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_6px_0_rgba(44,28,16,0.04)]"
      style={{ borderColor: '#F0EAE0' }}
    >
      {/* Image */}
      <div className="relative h-[110px] bg-bord/40">
        {promo.display_image_url ? (
          <img src={promo.display_image_url} alt="" className="block h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-texte-tres-doux">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-[5px] bg-[#E8622A] px-[7px] py-1 text-[9px] font-extrabold tracking-[0.08em] text-white">
          BON PLAN
        </span>
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Partager ce bon plan"
            onClick={ev => {
              ev.stopPropagation(); ev.preventDefault()
              shareLink({
                title: `${promo.title} — La Place du Village`,
                text:  `${promo.title}${promo.etablissement ? ' chez ' + promo.etablissement.nom : ''}`,
                url:   'https://laplaceduvillage.app/promotions',
              })
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-none bg-white/90 text-texte"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            onClick={ev => { ev.stopPropagation(); ev.preventDefault(); onToggleFav() }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-none bg-white/90"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={favorited ? '#E8622A' : 'none'} stroke={favorited ? '#E8622A' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={favorited ? '' : 'text-texte'}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[3px] px-2.5 pb-2.5 pt-2">
        {promo.etablissement && (
          <p className="m-0 truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-texte-doux">
            {promo.etablissement.nom}
          </p>
        )}

        <h3
          className="m-0 line-clamp-2 text-[13px] font-extrabold leading-[1.2] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {promo.title}
        </h3>

        {promo.description && (
          <p className="m-0 line-clamp-2 text-[11px] leading-[1.35] text-texte-doux">
            {promo.description}
          </p>
        )}

        {promo.conditions && (
          <div className="mt-0.5 flex items-start gap-1 rounded-md bg-[#E8F2EB] px-1.5 py-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-primary">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p className="m-0 line-clamp-2 text-[10px] font-semibold leading-[1.3] text-[#8A4A1F]">
              {promo.conditions}
            </p>
          </div>
        )}

        <p className="m-0 flex items-center gap-1 truncate text-[10.5px] text-texte-doux">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="9"/>
            <polyline points="12 7 12 12 15 14"/>
          </svg>
          {FREQ_LABEL[promo.frequency] ?? promo.frequency}
          {promo.valid_until && ` · ${new Date(promo.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
        </p>

        <div className="mt-auto flex flex-col gap-1.5">
          <button
            onClick={onDiscover}
            className="rounded-[10px] border border-bord bg-white px-2.5 py-2 text-[12px] font-bold text-primary"
            style={{ letterSpacing: '-0.01em' }}
          >
            Découvrir
          </button>
          <button
            onClick={onUse}
            disabled={disabled}
            className="rounded-[10px] border-none bg-accent px-2.5 py-2 text-[12px] font-bold text-white disabled:opacity-60"
            style={{ letterSpacing: '-0.01em' }}
          >
            {disabled ? '…' : "J'en profite"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmPositionModal({ promo, onClose, onConfirm, loading }: {
  promo: Promotion
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[4px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-6 pb-7 pt-[18px]"
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}
      >
        {/* Grabber */}
        <div className="mx-auto mb-[18px] h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        {/* Icone pin */}
        <div className="mx-auto mb-3.5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-primary-light text-primary">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
            <circle cx="12" cy="10" r="2.5"/>
          </svg>
        </div>

        <h2
          className="m-0 mb-1.5 text-center font-serif text-[22px] font-normal text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          Êtes-vous sur place ?
        </h2>
        <p className="m-0 mb-1 text-center text-[13px] leading-[1.5] text-texte-doux">
          Vous allez profiter de la promo<br />
          <strong className="text-texte">« {promo.title} »</strong>
        </p>
        {promo.etablissement && (
          <p className="m-0 mb-[18px] text-center text-[12px] text-texte-tres-doux">
            chez <strong className="text-texte-doux">{promo.etablissement.nom}</strong>
            {promo.etablissement.commune ? ` · ${promo.etablissement.commune}` : ''}
          </p>
        )}

        {promo.description && (
          <p className="m-0 mb-3 text-center text-[12.5px] leading-[1.5] text-texte-doux">
            {promo.description}
          </p>
        )}

        {promo.conditions && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#C5DCC9] bg-[#E8F2EB] px-3 py-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-primary">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p className="m-0 text-[11.5px] leading-[1.45] text-[#8A4A1F]">
              <strong>Conditions&nbsp;:</strong> {promo.conditions}
            </p>
          </div>
        )}

        {/* Bon usage notice */}
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#F0D9B8] bg-[#FFF7E5] px-3.5 py-2.5">
          <div className="shrink-0 pt-px text-[#A8770F]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p className="m-0 text-[11px] leading-[1.5] text-[#7A5614]">
            <strong>Bon usage&nbsp;:</strong> ne validez la promo que si vous êtes vraiment chez le commerçant. Le commerçant sera notifié de votre passage.
          </p>
        </div>

        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-none bg-accent px-4 py-3.5 text-[14px] font-bold text-white disabled:opacity-60"
        >
          {loading ? (
            '…'
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Oui, je confirme ma présence
            </>
          )}
        </button>
        <button
          onClick={onClose}
          className="w-full bg-transparent pt-2.5 text-[13px] font-semibold text-texte-doux"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Featured carousel V3 (À ne pas manquer) — défilement infini ───
function FeaturedPromoCarousel({ promos, onUse, coupDeCoeur = null, isAdmin = false, onEditOrder }: {
  promos: Promotion[]
  onUse: (p: Promotion) => void
  coupDeCoeur?: string | null
  isAdmin?: boolean
  onEditOrder?: () => void
}) {
  const N = promos.length
  const loop = N > 1
  // 3 copies pour une boucle fluide (on reste centré sur la copie du milieu).
  const display = loop ? [...promos, ...promos, ...promos] : promos
  const [activeIdx, setActiveIdx] = useState(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Démarre au début de la copie du milieu → on peut scroller des deux côtés.
  useEffect(() => {
    const el = scrollerRef.current
    if (el && loop) el.scrollLeft = el.scrollWidth / 3
  }, [loop, N])

  return (
    <div className="pt-[18px]">
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[15px] font-extrabold tracking-tight2 text-texte">À ne pas manquer</h3>
          {isAdmin && onEditOrder && (
            <button
              type="button"
              onClick={onEditOrder}
              aria-label="Ordre & coup de cœur (admin)"
              className="flex h-6 items-center gap-1 rounded-full border-[1.5px] px-2 text-[10px] font-extrabold"
              style={{ borderColor: '#E8A627', background: '#FFF8E8', color: '#B07E1F' }}
            >
              ⚙ Ordre
            </button>
          )}
        </div>
        <span className="text-[11px] font-bold text-texte-doux">{activeIdx + 1}/{N}</span>
      </div>
      <div
        ref={scrollerRef}
        className="pdv-hscroll flex gap-3 overflow-x-auto px-4 pb-1"
        style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: 16, scrollPaddingRight: 16 }}
        onScroll={e => {
          const el = e.currentTarget
          if (loop) {
            const setW = el.scrollWidth / 3
            // Recentrage seamless sur la copie du milieu (contenu identique).
            if (el.scrollLeft < setW * 0.5) el.scrollLeft += setW
            else if (el.scrollLeft > setW * 1.5) el.scrollLeft -= setW
            const step = setW / N
            setActiveIdx(((Math.round(el.scrollLeft / step)) % N + N) % N)
          } else {
            const step = el.scrollWidth / Math.max(1, N)
            setActiveIdx(Math.min(N - 1, Math.max(0, Math.round(el.scrollLeft / step))))
          }
        }}
      >
        {display.map((p, i) => {
          const img = p.display_image_url ?? p.image_url ?? p.etablissement?.photos?.[0]
          return (
            <button
              key={`${p.id}-${i}`}
              onClick={() => onUse(p)}
              className="relative shrink-0 overflow-hidden rounded-[18px] border border-bordSoft bg-white shadow-card text-left"
              style={{ width: 'calc(100vw - 64px)', maxWidth: 380, height: 200, scrollSnapAlign: 'start' }}
            >
              {img ? (
                <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#FFF0E5] text-[64px]">🎁</div>
              )}
              {/* Gradient bottom */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.78) 100%)' }} />
              {/* Badges top-left */}
              <div className="absolute left-3 top-3 flex gap-1.5">
                <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.06em] text-white">
                  BON PLAN
                </span>
                {coupDeCoeur && p.id === coupDeCoeur && (
                  <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.06em] text-accent backdrop-blur-sm">
                    ★ Coup de cœur
                  </span>
                )}
              </div>
              {/* Heart top-right */}
              <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-texte-doux shadow-[0_1px_4px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              {/* Text bottom-left */}
              <div className="absolute bottom-0 left-0 right-0 p-3.5">
                <div className="text-[11px] font-bold text-white/85">{p.etablissement?.nom ?? ''}{p.etablissement?.commune ? ` · ${p.etablissement.commune}` : ''}</div>
                <div className="mt-0.5 text-[16px] font-extrabold leading-tight text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                  {p.title}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {/* Dots indicator */}
      <div className="mt-2.5 flex justify-center gap-1">
        {promos.map((_, i) => (
          <span
            key={i}
            style={{ width: i === activeIdx ? 18 : 5, height: 5, borderRadius: 999, background: i === activeIdx ? '#2D5A3D' : '#D8D0C8', transition: 'width 0.18s' }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Modal Découvrir : encart promo + mini fiche etab ───
function DiscoverPromoModal({
  promo, onClose, onUse, isAdmin = false, onEdit, favorited = false, onToggleFav,
}: {
  promo: Promotion
  onClose: () => void
  onUse: () => void
  isAdmin?: boolean
  onEdit?: () => void
  favorited?: boolean
  onToggleFav?: () => void
}) {
  const [showEtabQuickView, setShowEtabQuickView] = useState(false)
  const etabPhoto = promo.etablissement?.photos?.[0]
  const etabTypeInfo = promo.etablissement?.type ? ETAB_TYPES[promo.etablissement.type] : null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[4px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-t-3xl bg-creme"
        style={{
          maxHeight: 'calc(100dvh - 40px)',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        }}
      >
        {/* Grabber + actions (partage, favori, fermer) */}
        <div className="relative">
          <div className="mx-auto mt-2 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />
          <div className="absolute left-3 top-2 flex gap-1.5">
            <button
              type="button"
              aria-label="Partager ce bon plan"
              onClick={() => shareLink({
                title: `${promo.title} — La Place du Village`,
                text:  `${promo.title}${promo.etablissement ? ' chez ' + promo.etablissement.nom : ''}`,
                url:   'https://laplaceduvillage.app/promotions',
              })}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white text-texte"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            {onToggleFav && (
              <button
                type="button"
                aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                onClick={onToggleFav}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={favorited ? '#E8622A' : 'none'} stroke={favorited ? '#E8622A' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={favorited ? '' : 'text-texte'}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white text-texte"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 pt-4" style={{ maxHeight: 'calc(100dvh - 200px)' }}>
          {/* Encart promo */}
          <div className="overflow-hidden rounded-[16px] border border-bordSoft bg-white">
            {promo.display_image_url && (
              <div className="relative h-[150px] bg-bord/40">
                <img src={promo.display_image_url} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-[5px] bg-[#E8622A] px-[7px] py-1 text-[9px] font-extrabold tracking-[0.08em] text-white">
                  BON PLAN
                </span>
              </div>
            )}
            <div className="px-4 py-3">
              <h2
                className="font-serif text-[20px] leading-[1.15] text-texte"
                style={{ letterSpacing: '-0.01em' }}
              >
                {promo.title}
              </h2>
              {promo.description && (
                <p className="mt-2 text-[13px] leading-[1.5] text-texte-doux">
                  {promo.description}
                </p>
              )}
              {promo.conditions && (
                <div className="mt-3 flex items-start gap-1.5 rounded-md bg-[#E8F2EB] px-2 py-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-primary">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <p className="text-[11px] font-semibold leading-[1.4] text-[#8A4A1F]">
                    {promo.conditions}
                  </p>
                </div>
              )}
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-texte-doux">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12 7 12 12 15 14"/>
                </svg>
                {FREQ_LABEL[promo.frequency] ?? promo.frequency}
                {promo.valid_until && ` · valable jusqu'au ${new Date(promo.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
              </p>
            </div>
          </div>

          {/* Encart etablissement (clic = dépliage quickview, pas navigation) */}
          {promo.etablissement && (
            <button
              type="button"
              onClick={() => setShowEtabQuickView(true)}
              className="mt-3 flex w-full items-center gap-3 overflow-hidden rounded-[16px] border border-bordSoft bg-white p-3 text-left"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-bord/40">
                {etabPhoto && <img src={etabPhoto} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                {etabTypeInfo && (
                  <div className="text-[9px] font-extrabold tracking-[0.1em] uppercase text-primary">
                    {etabTypeInfo.label}
                  </div>
                )}
                <div className="mt-0.5 truncate font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                  {promo.etablissement.nom}
                </div>
                {promo.etablissement.commune && (
                  <div className="mt-0.5 truncate text-[11px] text-texte-doux">
                    {promo.etablissement.commune}
                  </div>
                )}
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-doux">
                <polyline points="9 6 15 12 9 18"/>
              </svg>
            </button>
          )}
        </div>

        {/* CTA J'en profite sticky (+ Modifier admin) */}
        <div className="border-t border-bord bg-white px-4 py-3">
          {isAdmin && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="mb-2 w-full rounded-[12px] border-[1.5px] border-[#E8A627] bg-[#FFF8E8] py-2.5 text-[13px] font-extrabold text-[#B07E1F]"
            >
              ✏️ Modifier la promotion (admin)
            </button>
          )}
          <button
            type="button"
            onClick={onUse}
            className="w-full rounded-[12px] bg-accent py-3 text-[14px] font-bold text-white"
            style={{ boxShadow: '0 4px 14px rgba(200,75,47,0.32)' }}
          >
            J&apos;en profite
          </button>
        </div>
      </div>

      {/* QuickView fiche etab/producer empilée au-dessus (clic Fermer revient ici) */}
      {showEtabQuickView && promo.etablissement && (
        <EntityQuickView
          kind="etablissement"
          id={promo.etablissement.id}
          onClose={() => setShowEtabQuickView(false)}
        />
      )}
    </div>
  )
}

// ─── Admin : ordre du carrousel + coup de cœur ───────────────────────────────
function CarouselOrderModal({ promos, initialOrder, initialCoupDeCoeur, onClose, onSaved }: {
  promos: Promotion[]
  initialOrder: string[]
  initialCoupDeCoeur: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const initial = useMemo(() => {
    const idxOf = (id: string) => { const i = initialOrder.indexOf(id); return i === -1 ? Infinity : i }
    return [...promos].sort((a, b) => idxOf(a.id) - idxOf(b.id))
  }, [promos, initialOrder])
  const [list, setList] = useState<Promotion[]>(initial)
  const [coup, setCoup] = useState<string | null>(initialCoupDeCoeur)
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef<number | null>(null)

  const move = (from: number, to: number) => setList(prev => { const a = prev.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a })

  const save = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const r = await fetch('/api/promo-carousel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
      body: JSON.stringify({ order: list.map(p => p.id), coupDeCoeur: coup }),
    }).catch(() => null)
    setSaving(false)
    if (r && r.ok) { toast.success('Carrousel mis à jour'); onSaved() }
    else toast.error('Échec de l’enregistrement')
  }

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[4px] font-inter">
      <div onClick={e => e.stopPropagation()} className="flex w-full max-w-[480px] flex-col rounded-t-3xl bg-creme" style={{ maxHeight: 'calc(100dvh - 40px)', paddingBottom: 'max(16px,env(safe-area-inset-bottom,16px))' }}>
        <div className="mx-auto mt-2 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />
        <div className="px-4 pb-2 pt-3">
          <h2 className="m-0 font-serif text-[18px] text-texte" style={{ letterSpacing: '-0.01em' }}>Ordre du carrousel</h2>
          <p className="m-0 mt-0.5 text-[12px] text-texte-doux">Glisse ⠿ pour réordonner (les 5 premières s’affichent). L’étoile ★ = coup de cœur (une seule, ou aucune).</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-1" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((p, i) => {
            const img = p.display_image_url ?? p.image_url ?? p.etablissement?.photos?.[0] ?? null
            const isCoup = coup === p.id
            return (
              <div
                key={p.id}
                draggable
                onDragStart={() => { dragIdx.current = i }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragIdx.current !== null && dragIdx.current !== i) move(dragIdx.current, i); dragIdx.current = null }}
                className="flex items-center gap-2.5 rounded-xl border bg-white px-2.5 py-2"
                style={{ borderColor: isCoup ? '#E8A627' : '#EDE6DA' }}
              >
                <span className="cursor-grab text-[16px] text-texte-doux">⠿</span>
                <span className="w-4 text-center text-[11px] font-bold text-texte-doux">{i + 1}</span>
                {img
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={img} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#FFF0E5] text-[18px]">🎁</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-texte">{p.title}</div>
                  {p.etablissement?.nom && <div className="truncate text-[11px] text-texte-doux">{p.etablissement.nom}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => setCoup(c => c === p.id ? null : p.id)}
                  aria-label="Coup de cœur"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px]"
                  style={{ background: isCoup ? '#E8A627' : '#F0EAE0', color: isCoup ? '#fff' : '#B0A493' }}
                >★</button>
              </div>
            )
          })}
          {list.length === 0 && <p className="py-8 text-center text-[12px] text-texte-doux">Aucune promotion.</p>}
        </div>
        <div className="flex gap-2 px-4 pt-2">
          <button onClick={onClose} className="flex-1 rounded-xl border bg-white py-3 text-[13px] font-bold text-texte-doux" style={{ borderColor: '#E5DDD2' }}>Annuler</button>
          <button onClick={save} disabled={saving} className="flex-[2] rounded-xl border-none bg-primary py-3 text-[13px] font-extrabold text-white disabled:opacity-60">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
