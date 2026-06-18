'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { EtablissementType, Evenement } from '@/lib/types'
import { getPrixAffiche, type Annonce } from '@/lib/annonces'
import type { MediaItem } from '@/lib/postMedia'
import HubTopBar from '@/components/HubTopBar'
import HubSearchBar from '@/components/HubSearchBar'
import PlansCardFinal from '@/components/PlansCardFinal'
import { useAnnonceFavorites } from '@/hooks/useAnnonceFavorites'
import { shareLink } from '@/lib/share'
import { normalizeHubOrder } from '@/lib/hubSections'
// Fetcher + config SWR héritent du provider global (cf. src/components/SWRProvider.tsx).

interface Props {
  onSelectAgenda:        () => void
  onSelectAgendaToday?:  () => void
  onSelectAnnuaire:      (typeFilter?: EtablissementType) => void
  onSelectProducteurs:   () => void
  onComingSoon:          (label: string) => void
  onUpgradePrompt:       (requiredPlan: 'habitants' | 'pro', label: string) => void
  onOpenNotifs?:         () => void
  onOpenInfo?:           () => void
  onOpenSearch?:         () => void
  unreadCount?:          number
}

interface PromoCard {
  id: string
  title: string
  description: string | null
  image_url: string | null
  display_image_url: string | null
  etablissement: { nom: string; commune: string | null } | null
}

interface HeroEtab {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
  type: string | null
}

interface HeroProducteur {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
}

interface HeroTopic {
  id: string
  titre: string
  media: MediaItem[] | null
}

type HeroItem =
  | { kind: 'intro';         data: { imageUrl: string | null }; imagePosition: null }
  | { kind: 'evenement';     data: Evenement;        imagePosition: string | null }
  | { kind: 'etablissement'; data: HeroEtab;         imagePosition: string | null }
  | { kind: 'producteur';    data: HeroProducteur;   imagePosition: string | null }
  | { kind: 'forum_topic';   data: HeroTopic;        imagePosition: string | null }

interface JournalLite {
  id: string
  numero: number
  cover_titre: string | null
  cover_image_url: string | null
  temps_lecture_min: number | null
  publie_at: string | null
  position_hub: 'haut' | 'bas' | null
}

interface CovoitLite {
  id: string
  depart: string
  destination: string
  date_trajet: string
  heure_depart: string | null
  prix: number
  places: number
  places_prises: number
  statut: 'actif' | 'complet' | 'annule'
}

interface ForumTopLite {
  id: string
  titre: string
  media: { t: string; url: string }[] | null
  poll: unknown | null
  comment_count: number
  like_count: number
  last_activity_at: string
  author_name: string | null
}

const TILES: { id: string; label: string; iconSrc: string; click: (p: Props, router: ReturnType<typeof useRouter>) => void }[] = [
  { id: 'agenda',      label: 'Agenda',      iconSrc: '/icones-rondes/01_agenda_culturel.png',         click: p => p.onSelectAgenda() },
  { id: 'annuaire',    label: 'Annuaire',    iconSrc: '/icones-rondes/02_annuaire_professionnel.png',  click: p => p.onSelectAnnuaire() },
  // Producteurs temporairement retiré du hub (à remettre plus tard) — remplacé
  // par Discussions / La Place Publique. La prop onSelectProducteurs reste
  // disponible pour la réintroduction.
  { id: 'forum',       label: 'Discussions', iconSrc: '/icones-rondes/14_forum_max.png',               click: (_, r) => r.push('/forum') },
  { id: 'annonces',    label: 'Annonces',    iconSrc: '/icones-rondes/07_annonces_locales.png',        click: (_, r) => r.push('/annonces') },
  { id: 'promos',      label: 'Bons plans',  iconSrc: '/icones-rondes/11_promotions_locales.png',      click: (_, r) => r.push('/promotions') },
]

function dateLabel(iso: string | null): string {
  if (!iso) return ''
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(iso); d.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0)  return 'Aujourd\'hui'
  if (diff === 1)  return 'Demain'
  if (diff === -1) return 'Hier'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Label compact pour vignettes d'événements. Cas :
 *  - Event mono-jour avec heure → "HH:MM"
 *  - Event multi-jours (date_fin > date_debut) → "Jusqu'au DD mois" (les expos
 *    en cours auraient sinon une date_debut passée trompeuse).
 *  - Sinon → dateLabel(date_debut)
 */
function eventWhenLabel(
  date_debut: string | null,
  date_fin: string | null,
  heure: string | null,
): string {
  const multiJour = !!date_debut && !!date_fin && date_fin !== date_debut
  if (multiJour && date_fin) {
    const fin = new Date(date_fin)
    return `Jusqu'au ${fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  }
  if (heure) return heure.slice(0, 5)
  return date_debut ? dateLabel(date_debut) : '—'
}

function categorieKicker(c: string | null | undefined): string {
  if (!c) return 'ÉVÉNEMENT'
  return c.toUpperCase()
}

export default function HubView({
  onSelectAgenda, onSelectAgendaToday, onSelectAnnuaire, onSelectProducteurs,
  onComingSoon, onUpgradePrompt,
  onOpenNotifs, onOpenInfo, onOpenSearch, unreadCount = 0,
}: Props) {
  const router = useRouter()
  const { profile, isAdmin } = useAuth()
  // Carte d'abonnement sur l'accueil : masquée si déjà dismissée (par user) ou
  // si le plan est déjà payant.
  const [plansCardDismissed, setPlansCardDismissed] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem('pdv-plans-card-dismissed') === '1') setPlansCardDismissed(true) } catch { /* ignore */ }
  }, [])
  // Favoris ANNONCES (séparés de useFavorites events). Assainit le bug
  // antérieur : avant ce swap, toggleFav appelait /api/evenements/{id}/favorite
  // avec un id d'annonce → INSERT silencieux invalide (FK).
  const { favIds, toggle: toggleFav } = useAnnonceFavorites()

  // ──────────────────────────────────────────────────────────────────────
  // SWR sur /api/hub :
  // - 1ère visite : 1 fetch HTTP (comme avant)
  // - Revisite : affichage INSTANTANÉ depuis le cache SWR (mémoire), puis
  //   revalidation discrète en fond (revalidateOnFocus + revalidateOnMount).
  // - dedupingInterval 5s : si le composant se remonte plusieurs fois en
  //   <5s (nav A → B → A rapide), on ne fait qu'un seul fetch.
  // - mutate() exposé pour invalider depuis le Realtime channel.
  // ──────────────────────────────────────────────────────────────────────
  // Date locale du téléphone au format YYYY-MM-DD (PAS toISOString → décalage
  // UTC). Passée au serveur via `d=` pour que "aujourd'hui" soit calculé
  // selon le fuseau de l'user. Bascule automatiquement à minuit local : la
  // clé SWR change, nouvelle entrée cache, payload frais.
  //
  // Calculé à chaque render (pas de useMemo []) pour qu'au prochain
  // re-render après minuit (focus, revalidate, etc.), la nouvelle date soit
  // détectée et la clé SWR bascule.
  const _d = new Date()
  const todayLocalYMD = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

  // Options (revalidateOnFocus / dedupingInterval / keepPreviousData) +
  // fetcher viennent du SWRProvider global → on n'a plus à les répéter ici.
  const { data: hubData, mutate: mutateHub } = useSWR(`/api/hub?d=${todayLocalYMD}`)

  // ── Derive les states UI depuis hubData (SWR est la source de vérité) ──
  const zoneCounts = useMemo(() => ({
    evt:  hubData?.zoneCounts?.evt  ?? 0,
    etab: hubData?.zoneCounts?.etab ?? 0,
    prod: hubData?.zoneCounts?.prod ?? 0,
  }), [hubData])

  // Hero items : prepend slide intro si admin a coché l'option
  const heroItems = useMemo<HeroItem[]>(() => {
    const items: HeroItem[] = (hubData?.heroItems ?? []) as HeroItem[]
    if (hubData?.introEnabled) {
      return [{ kind: 'intro', data: { imageUrl: hubData.introImageUrl ?? null }, imagePosition: null }, ...items]
    }
    return items
  }, [hubData])
  const heroLoaded = hubData !== undefined

  const todayEvents: Evenement[] = (hubData?.todayEvents ?? []) as Evenement[]
  const todayTotal: number       = hubData?.todayTotal ?? 0
  const promos: PromoCard[]      = (hubData?.promos ?? []) as PromoCard[]
  const ventesAnnonces: Annonce[] = (hubData?.ventes ?? []) as Annonce[]
  const ventesTotal: number      = hubData?.ventesTotal ?? 0
  const journal: JournalLite | null = (hubData?.journal ?? null) as JournalLite | null
  const covoits: CovoitLite[]    = (hubData?.covoits ?? []) as CovoitLite[]
  const forumTopics: ForumTopLite[] = (hubData?.forumTopics ?? []) as ForumTopLite[]
  const sectionOrder: string[] = normalizeHubOrder(hubData?.sectionOrder)
  const hubHidden = new Set<string>((hubData?.sectionHidden as string[] | undefined) ?? [])

  // Realtime : invalide le cache SWR sur changement DB
  // → mutate() refetch en arrière-plan, l'UI bascule automatiquement.
  useEffect(() => {
    const ch = supabase
      .channel('hub-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'featured_slots' }, () => mutateHub())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journaux_hebdo' }, () => mutateHub())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'covoiturages' }, () => mutateHub())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics' }, () => mutateHub())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_comments' }, () => mutateHub())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, () => mutateHub())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [mutateHub])

  // Note : revalidateOnFocus de SWR gère déjà focus + visibilitychange,
  // pas besoin de listener manuel comme avant.

  const firstName = profile?.display_name?.split(' ')[0] || 'Visiteur'
  // Compteur greeting = nombre d'événements totaux (cohérent avec page Agenda
  // quand tous filtres sont sur "Tout"). Pas le grand total tout-confondu.
  const totalNear = zoneCounts.evt

  const [featuredEv, ...restEvents] = todayEvents
  const miniEvents = restEvents.slice(0, 2)

  // Routage du journal : 'haut' → bento Aujourd'hui ; sinon (bas/null) → 3e
  // tuile du bento Place publique s'il y a des sujets, à défaut bento du bas.
  const journalInPlacePublique = !!journal && journal.position_hub !== 'haut' && forumTopics.length > 0

  // Sections de contenu réordonnables (ordre piloté par l'admin via config).
  // Les parties fixes (barre, recherche, hero, tuiles, footer) restent hors map.
  const sectionNodes: Record<string, ReactNode> = {
    // ── Carte abonnement (membres gratuits non-dismissés uniquement) ──────────
    plans_card: ((profile?.plan ?? 'basic') === 'basic' && !plansCardDismissed) ? (
      <PlansCardFinal
        onClick={() => onUpgradePrompt('habitants', 'Promotions illimitées')}
        onDismiss={() => { try { localStorage.setItem('pdv-plans-card-dismissed', '1') } catch { /* ignore */ }; setPlansCardDismissed(true) }}
      />
    ) : null,
    // ── Aujourd'hui — bento featured + 2 mini (ou 1 mini + journal si haut) ──
    aujourdhui: todayEvents.length > 0 ? (() => {
      const journalInTop = journal?.position_hub === 'haut'
      const visibleMinis = journalInTop ? miniEvents.slice(0, 1) : miniEvents
      const shownEvents = (featuredEv ? 1 : 0) + visibleMinis.length
      const remaining = Math.max(0, todayTotal - shownEvents)
      const showMoreCard = !journalInTop && featuredEv && remaining > 0 && visibleMinis.length < 2
      return (
        <>
          <SectionHeaderV3
            title="Aujourd'hui"
            kicker={`· ${todayTotal}`}
            subtitle={`${todayTotal} événement${todayTotal > 1 ? 's' : ''} près de chez vous`}
            action="Voir tout"
            onAction={onSelectAgendaToday ?? onSelectAgenda}
          />
          <div
            className="grid gap-2 px-4"
            style={{
              gridTemplateColumns: '1.25fr 1fr',
              // Hauteur de section fixée par la grande tuile de gauche ; les
              // rangées en minmax(0,1fr) empêchent les mini-tuiles d'allonger
              // la grille (elles remplissent leur demi-hauteur, image croppée).
              gridTemplateRows: (visibleMinis.length >= 1 || journalInTop) ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
              height: (visibleMinis.length >= 1 || journalInTop) ? 240 : undefined,
            }}
          >
            {featuredEv && (
              <FeaturedEventCard ev={featuredEv} onClick={() => router.push(`/evenement/${featuredEv.id}`)} />
            )}
            {visibleMinis.map(ev => (
              <MiniEventCard key={ev.id} ev={ev} onClick={() => router.push(`/evenement/${ev.id}`)} />
            ))}
            {journalInTop && journal && (
              <JournalTile journal={journal} onClick={() => router.push(`/journal/${journal.numero}`)} />
            )}
            {showMoreCard && (
              <MoreEventsCard count={remaining} onClick={onSelectAgendaToday ?? onSelectAgenda} />
            )}
          </div>
        </>
      )
    })() : null,

    // ── Bons plans — 3 colonnes compactes ──
    bonsplans: promos.length > 0 ? (
      <>
        <SectionHeaderV3
          title="Bons plans"
          kicker={`· ${promos.length}`}
          subtitle="Chez vos commerçants partenaires"
          action="Voir tout"
          onAction={() => router.push('/promotions')}
        />
        <div className="grid grid-cols-3 gap-1.5 px-4">
          {promos.slice(0, 3).map(p => (
            <CompactPromoCard key={p.id} promo={p} onClick={() => router.push(`/promotions?id=${p.id}`)} />
          ))}
        </div>
      </>
    ) : null,

    // ── Ventes — 2x2 ──
    ventes: ventesAnnonces.length > 0 ? (
      <>
        <SectionHeaderV3
          title="Annonces"
          kicker={`· ${ventesTotal}`}
          subtitle="Annonces en baisse cette semaine"
          action="Voir tout"
          onAction={() => router.push('/annonces')}
        />
        <div className="grid grid-cols-2 gap-2 px-4">
          {ventesAnnonces.map(a => (
            <SaleAnnonceCard
              key={a.id}
              annonce={a}
              favored={favIds.includes(a.id)}
              onToggleFav={() => toggleFav(a.id)}
              onClick={() => router.push(`/annonces/${a.id}`)}
            />
          ))}
        </div>
      </>
    ) : null,

    // ── Place publique — bento irrégulier (featured + minis + journal opt) ──
    place_publique: forumTopics.length > 0 ? (() => {
      const [featTopic, ...restTopics] = forumTopics
      const miniTopics = restTopics.slice(0, 2)
      const visibleMinis = journalInPlacePublique ? miniTopics.slice(0, 1) : miniTopics
      return (
        <>
          <SectionHeaderV3
            title="Place publique"
            subtitle="Les discussions du moment"
            action="Voir tout"
            onAction={() => router.push('/forum')}
          />
          <div
            className="grid gap-2 px-4"
            style={{
              gridTemplateColumns: '1.25fr 1fr',
              gridTemplateRows: (visibleMinis.length >= 1 || journalInPlacePublique) ? '1fr 1fr' : '1fr',
            }}
          >
            {featTopic && (
              <FeaturedTopicCard topic={featTopic} onClick={() => router.push(`/forum/${featTopic.id}`)} />
            )}
            {visibleMinis.map(t => (
              <MiniTopicCard key={t.id} topic={t} onClick={() => router.push(`/forum/${t.id}`)} />
            ))}
            {journalInPlacePublique && journal && (
              <JournalTile journal={journal} onClick={() => router.push(`/journal/${journal.numero}`)} />
            )}
          </div>
        </>
      )
    })() : null,

    // ── Covoiturage (+ Journal si pas déjà placé) ──
    covoiturage: (() => {
      const showJournalBottom = !!journal && journal.position_hub !== 'haut' && !journalInPlacePublique
      return (
        <div
          className="grid gap-2 px-4 pt-6"
          style={{ gridTemplateColumns: showJournalBottom ? '1.5fr 1fr' : '1fr' }}
        >
          <CovoitTile covoits={covoits} onClick={() => router.push('/covoiturage')} />
          {showJournalBottom && journal && (
            <JournalTile journal={journal} onClick={() => router.push(`/journal/${journal.numero}`)} />
          )}
        </div>
      )
    })(),
  }

  return (
    <div className="min-h-full bg-creme pb-6 font-inter">
      <style>{`
        .pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .pdv-hscroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── 1. Top bar ─────────────────────────────────────────────────── */}
      <HubTopBar
        onOpenMenu={onOpenInfo}
        onOpenNotifs={onOpenNotifs}
        unreadCount={unreadCount}
        onShareApp={() => shareLink({
          title: 'La Place du Village',
          text:  'Le village vivant autour de Ganges : événements, commerces, producteurs, annonces.',
          url:   'https://laplaceduvillage.app',
        })}
      />

      {/* ── 2. Search bar ─────────────────────────────────────────────── */}
      <HubSearchBar onClick={onOpenSearch} />

      {/* ── 3. Greeting + bouton "Les gens" + compteur events + EN DIRECT ─ */}
      <div className="px-4 pt-[18px]">
        <div className="flex items-start justify-between gap-3">
          <h1
            className="m-0 min-w-0 flex-1 truncate font-serif text-[24px] leading-[1.1] text-texte"
            style={{ letterSpacing: '-0.01em' }}
          >
            Bonjour, {firstName}
          </h1>
          {/* Bouton "Les gens" — temporairement caché aux non-admins le temps
              de décider de l'approche finale (compteur visites vs compteur
              membres, etc.). Reste accessible aux admins pour test. */}
          {isAdmin && (
            <Link
              href="/people"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-bord bg-white px-3 py-1.5 text-[12px] font-bold text-texte no-underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Les gens
            </Link>
          )}
        </div>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-texte-doux">
          <span><span className="font-semibold text-texte">{totalNear}</span> événement{totalNear > 1 ? 's' : ''} près de toi</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F2EB] px-1.5 py-[2px] text-[9px] font-extrabold tracking-[0.06em] text-primary">
            <span
              className="inline-block h-[5px] w-[5px] rounded-full bg-[#5BC85B]"
              style={{ boxShadow: '0 0 0 2px rgba(91,200,91,0.30)' }}
            />
            EN DIRECT
          </span>
        </p>
      </div>

      {/* ── 4. Hero carousel À LA UNE ─────────────────────────────────── */}
      {!heroLoaded ? (
        // Skeleton hauteur exacte (180px + px-4 pt-[18px] match du wrapper)
        <div className="px-4 pt-[18px]">
          <div className="h-[180px] w-full animate-pulse rounded-tile bg-cremeDeep" />
        </div>
      ) : heroItems.length > 0 ? (
        <HubHeroCarousel
          items={heroItems}
          onSelect={item => {
            if      (item.kind === 'intro')         onOpenInfo?.()
            else if (item.kind === 'evenement')     router.push(`/evenement/${item.data.id}`)
            else if (item.kind === 'etablissement') router.push(`/etablissement/${item.data.id}`)
            else if (item.kind === 'forum_topic')   router.push(`/forum/${item.data.id}`)
            else                                    router.push(`/producteur/${item.data.id}`)
          }}
        />
      ) : null}

      {/* ── 5. Tiles 5 colonnes ───────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-x-2 gap-y-3 px-4 pb-1 pt-[18px]">
        {TILES.map(t => (
          <button
            key={t.id}
            onClick={() => t.click({ onSelectAgenda, onSelectAnnuaire, onSelectProducteurs, onComingSoon, onUpgradePrompt }, router)}
            className="flex flex-col items-center gap-1.5 bg-transparent p-0"
          >
            <div className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border border-bord bg-white shadow-tile">
              <Image
                src={t.iconSrc}
                alt={t.label}
                width={48}
                height={48}
                className="h-[88%] w-[88%] object-contain"
                priority
              />
            </div>
            <span className="text-center text-[11px] font-semibold leading-[1.15] text-texte">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Sections de contenu — ordre piloté par l'admin, sections masquées exclues ── */}
      {sectionOrder.filter(id => !hubHidden.has(id)).map(id => <Fragment key={id}>{sectionNodes[id]}</Fragment>)}

      {/* ── 10. Footer légal (discret, requis Google OAuth + RGPD) ───────
          Présence d'un lien Privacy Policy/CGU depuis la home est attendue
          par l'OAuth consent screen Google. Footer volontairement sobre,
          11px gris, hors champ visuel principal. */}
      <footer className="mt-10 border-t border-[#E8E0D4] px-4 pb-2 pt-6 text-center text-[11px] text-[#A99B89]">
        <a href="/mentions-legales" className="hover:text-texte">Mentions légales</a>
        <span className="mx-2">·</span>
        <a href="/politique-confidentialite" className="hover:text-texte">Politique de confidentialité</a>
        <span className="mx-2">·</span>
        <a href="/cgu" className="hover:text-texte">CGU</a>
      </footer>
    </div>
  )
}

/* ─── SectionHeader V3 ───────────────────────────────────────────────── */

function SectionHeaderV3({
  title, kicker, subtitle, action, onAction,
}: {
  title: string
  kicker?: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="px-4 pb-3 pt-6">
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h3
            className="m-0 truncate font-serif text-[22px] font-normal leading-[1.1] text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            {title}
          </h3>
          {kicker && (
            <span className="shrink-0 text-[11px] font-bold text-texte-doux">{kicker}</span>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap bg-transparent p-0 text-[12px] font-bold text-primary"
          >
            {action}
            <IconArrow size={11} />
          </button>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-[12px] font-medium text-texte-doux">{subtitle}</p>
      )}
    </div>
  )
}

/* ─── Aujourd'hui — FeaturedEventCard ────────────────────────────────── */

function FeaturedEventCard({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const time = eventWhenLabel(ev.date_debut, ev.date_fin, ev.heure)
  const kicker = `${categorieKicker(ev.categorie)} · À LA UNE`
  const where = ev.lieux?.nom ?? ev.lieux?.commune ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ gridColumn: 'span 1', gridRow: 'span 2', borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[16px] border bg-white shadow-[0_6px_20px_rgba(44,28,16,0.10)]"
    >
      {/* Affiche : remplit toute la hauteur dispo de la tuile (2 rangées) */}
      <div className="relative min-h-0 flex-1 bg-bord/40">
        {ev.image_url
          ? <img src={ev.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#A85138] to-[#6E2E1E]" />
        }
        <div className="absolute left-2 top-2 rounded-[5px] bg-accent px-2 py-[3px] text-[10px] font-extrabold tracking-[0.08em] text-white">
          {time}
        </div>
      </div>
      {/* Bloc texte compact en bas (pas de justify-between → plus de blanc) */}
      <div className="shrink-0 px-3 pb-3 pt-2.5">
        <div className="text-[9px] font-extrabold tracking-[0.12em] text-accent">{kicker}</div>
        <div
          className="mt-0.5 font-serif text-[16px] leading-[1.15] text-texte"
          style={{ letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {ev.titre}
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-texte-doux">
          <IconPin size={11} />
          <span className="truncate">{where}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Aujourd'hui — MiniEventCard ────────────────────────────────────── */

function MiniEventCard({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const time = eventWhenLabel(ev.date_debut, ev.date_fin, ev.heure)
  const kicker = categorieKicker(ev.categorie)
  const where = ev.lieux?.nom ?? ev.lieux?.commune ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex min-h-0 cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_4px_14px_rgba(44,28,16,0.08)]"
    >
      {/* Image en haut (pleine largeur, croppée) */}
      <div className="relative min-h-0 flex-1 bg-bord/40">
        {ev.image_url
          ? <img src={ev.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#A8C28E] to-[#5B8A4A]" />
        }
        <div className="absolute left-1.5 top-1.5 rounded bg-white/95 px-1.5 py-[2px] text-[9px] font-extrabold text-texte">
          {time}
        </div>
      </div>
      {/* Infos en bas (hauteur fixe → l'image prend le reste) */}
      <div className="shrink-0 px-2.5 pb-1.5 pt-1">
        <div className="truncate text-[8px] font-extrabold tracking-[0.12em] text-primary">{kicker}</div>
        <div
          className="truncate text-[12px] font-bold leading-[1.15] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {ev.titre}
        </div>
        <div className="flex items-center gap-1 truncate text-[10px] text-texte-doux">
          <IconPin size={9} />
          <span className="truncate">{where}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Aujourd'hui — placeholder "+N" si bento incomplet ──────────────── */

function MoreEventsCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed bg-cremeDeep text-center"
    >
      <div className="flex flex-col items-center gap-1 px-3 py-4">
        <span className="font-serif text-[20px] leading-none text-primary">+{count}</span>
        <span className="text-[10px] font-bold tracking-[0.06em] text-texte-doux">
          ÉVÉNEMENT{count > 1 ? 'S' : ''}
        </span>
        <span className="text-[10px] font-bold text-primary">Voir tout →</span>
      </div>
    </button>
  )
}

/* ─── Bons plans — CompactPromoCard ──────────────────────────────────── */

function CompactPromoCard({ promo, onClick }: { promo: PromoCard; onClick: () => void }) {
  const photo = promo.display_image_url ?? promo.image_url
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
    >
      <div className="relative h-[78px] bg-bord/40">
        {photo && (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-[#E8622A] px-1.5 py-[3px] text-[9px] font-extrabold tracking-[0.08em] text-white">
          BON PLAN
        </div>
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div
          className="line-clamp-2 text-[11px] font-bold leading-[1.2] text-texte"
          style={{ letterSpacing: '-0.01em', minHeight: 26 }}
        >
          {promo.title}
        </div>
        <div className="mt-1 truncate text-[9.5px] text-texte-doux">
          {promo.etablissement?.nom ?? ''}
        </div>
      </div>
    </div>
  )
}

/* ─── Ventes — SaleAnnonceCard ───────────────────────────────────────── */

function SaleAnnonceCard({
  annonce, favored, onToggleFav, onClick,
}: {
  annonce: Annonce
  favored: boolean
  onToggleFav: () => void
  onClick: () => void
}) {
  const photo = annonce.photos?.[0]
  const prixActuel = annonce.prix_actuel
  const prixInitial = annonce.prix_initial
  const showStrike = prixActuel != null && prixInitial != null && prixInitial > prixActuel
  const pct = showStrike
    ? Math.round(100 - (prixActuel! / prixInitial!) * 100)
    : null
  const prixLabel = getPrixAffiche(annonce)
  const villeBlock = annonce.ville ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
    >
      <div className="relative h-[96px] bg-bord/40">
        {photo
          ? <img src={photo} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#9CB489] to-[#5B8A4A]" />
        }
        {pct !== null && pct > 0 && (
          <div className="absolute left-1.5 top-1.5 rounded bg-[#E03A3A] px-[7px] py-[3px] text-[11px] font-extrabold text-white">
            −{pct}%
          </div>
        )}
        <button
          type="button"
          aria-label={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={ev => { ev.stopPropagation(); ev.preventDefault(); onToggleFav() }}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-none bg-white/95"
          style={{ color: favored ? '#C84B2F' : '#1A1209' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={favored ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div
          className="truncate text-[12px] font-bold leading-[1.2] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {annonce.titre}
        </div>
        <div className="mt-[3px] flex items-baseline gap-1.5">
          <span className="font-serif text-[16px] leading-none text-accent">
            {prixLabel}
          </span>
          {showStrike && (
            <span className="text-[11px] text-texte-tres-doux line-through">
              {prixInitial} €
            </span>
          )}
        </div>
        <div className="mt-[3px] truncate text-[10px] text-texte-doux">
          {villeBlock}
        </div>
      </div>
    </div>
  )
}

/* ─── Bottom bento — CovoitTile (tableau "départ → destination") ─────── */

function CovoitTile({
  covoits, onClick,
}: {
  covoits: CovoitLite[]
  onClick: () => void
}) {
  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.getTime() === today.getTime())    return "Auj."
    if (d.getTime() === tomorrow.getTime()) return 'Demain'
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }
  const rows = covoits.slice(0, 3)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ouvrir le covoiturage"
      className="flex w-full cursor-pointer flex-col overflow-hidden rounded-[18px] border bg-white p-0 text-left text-texte"
      style={{
        borderColor: '#E8E0D4',
        boxShadow: '0 4px 14px rgba(26,18,9,0.08)',
      }}
    >
      {/* Header — typo */}
      <div className="flex items-end justify-between gap-2 border-b border-bordSoft px-4 py-3">
        <div>
          <div className="text-[9px] font-extrabold tracking-[0.12em] text-texte-doux">ENTRE VOISINS</div>
          <div
            className="mt-[3px] font-serif text-[18px] leading-[1.1] text-texte"
            style={{ letterSpacing: '-0.01em' }}
          >
            Covoiturage
          </div>
        </div>
        <IconArrow size={18} />
      </div>

      {/* Tableau */}
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-texte-doux">
          Aucun trajet pour l&apos;instant — propose-en un.
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid #F0EAE0',
              }}
            >
              {/* Date / Heure */}
              <div className="w-[54px] shrink-0 leading-tight">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.04em] text-texte">
                  {fmtDate(c.date_trajet)}
                </div>
                {c.heure_depart && (
                  <div className="text-[10px] font-medium tabular-nums text-texte-doux">{c.heure_depart}</div>
                )}
              </div>

              {/* Depart → Destination */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[13px] font-bold text-texte">{c.depart}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="13 6 19 12 13 18"/>
                </svg>
                <span className="truncate text-[13px] font-bold text-texte">{c.destination}</span>
              </div>

              {/* Prix */}
              <div className="shrink-0 text-[11px] font-extrabold tabular-nums text-primary">
                {c.prix > 0 ? `${c.prix.toFixed(2).replace(/\.00$/, '')} €` : 'Gratuit'}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

/* ─── Place publique — FeaturedTopicCard (grande tuile, span 2 rangées) ── */

function FeaturedTopicCard({ topic, onClick }: { topic: ForumTopLite; onClick: () => void }) {
  const photo = topic.media?.find(m => m.t === 'photo')?.url ?? null
  const replies = topic.comment_count
  const kicker = topic.poll != null ? 'SONDAGE' : 'DISCUSSION'
  const author = topic.author_name ?? 'Quelqu\'un'

  // Avec photo : image + bloc texte (comme FeaturedEventCard)
  if (photo) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        style={{ gridColumn: 'span 1', gridRow: 'span 2', borderColor: '#F0EAE0' }}
        className="flex cursor-pointer flex-col overflow-hidden rounded-[16px] border bg-white shadow-[0_6px_20px_rgba(44,28,16,0.10)]"
      >
        <div className="relative min-h-0 flex-1 bg-bord/40">
          <img src={photo} alt="" className="h-full w-full object-cover" />
          <div className="absolute left-2 top-2 rounded-[5px] bg-primary px-2 py-[3px] text-[10px] font-extrabold tracking-[0.08em] text-white">{kicker}</div>
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2.5">
          <div
            className="font-serif text-[16px] leading-[1.15] text-texte"
            style={{ letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {topic.titre}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-texte-doux">
            <span className="truncate">{author}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0 font-bold text-primary">{replies} rép.</span>
            {topic.like_count > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-accent">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                {topic.like_count}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Sans photo : panneau couleur, titre en grand (les sujets sont souvent textuels)
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ gridColumn: 'span 1', gridRow: 'span 2', background: 'linear-gradient(160deg, var(--primary) 0%, #1A3A2A 100%)' }}
      className="flex cursor-pointer flex-col justify-between overflow-hidden rounded-[16px] p-3.5 text-white shadow-[0_6px_20px_rgba(44,28,16,0.10)]"
    >
      <div className="text-[9px] font-extrabold tracking-[0.12em] text-white/75">{kicker}</div>
      <div
        className="my-2 flex-1 font-serif text-[19px] leading-[1.18]"
        style={{ letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {topic.titre}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/85">
        <span className="truncate">{author}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0 font-bold">{replies} rép.</span>
        {topic.like_count > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            {topic.like_count}
          </span>
        )}
      </div>
    </div>
  )
}

/* ─── Place publique — MiniTopicCard (petite tuile) ──────────────────── */

function MiniTopicCard({ topic, onClick }: { topic: ForumTopLite; onClick: () => void }) {
  const photo = topic.media?.find(m => m.t === 'photo')?.url ?? null
  const replies = topic.comment_count
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer overflow-hidden rounded-[14px] border bg-white shadow-[0_4px_14px_rgba(44,28,16,0.08)]"
    >
      {photo && (
        <div className="relative w-[64px] shrink-0 bg-bord/40">
          <img src={photo} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2px] px-2.5 py-2">
        <div className="truncate text-[8px] font-extrabold tracking-[0.12em] text-primary">{topic.poll != null ? 'SONDAGE' : 'SUJET'}</div>
        <div
          className="line-clamp-2 text-[12px] font-bold leading-[1.15] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {topic.titre}
        </div>
        <div className="flex items-center gap-1.5 truncate text-[10px] text-texte-doux">
          <span className="truncate">{topic.author_name ?? 'Quelqu\'un'}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 font-bold text-primary">{replies} rép.</span>
          {topic.like_count > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-accent">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {topic.like_count}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Bottom bento — JournalTile (1fr, fond noir) ────────────────────── */

function JournalTile({
  journal, onClick,
}: {
  journal: JournalLite | null
  onClick: () => void
}) {
  const numero = journal?.numero
  const titre = journal?.cover_titre ?? 'Le journal hebdo arrive bientôt'
  const minutes = journal?.temps_lecture_min ?? null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={numero ? `Journal n°${numero}` : 'Journal — bientôt'}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[18px] border-none p-0 text-left text-creme"
      style={{ background: '#1A1209', boxShadow: '0 6px 18px rgba(26,18,9,0.20)' }}
    >
      <div className="flex h-full flex-col p-3 pt-3.5">
        {numero != null && (
          <div
            className="self-start rounded-lg bg-[#E8C58A] px-[9px] py-[6px] font-serif leading-none text-texte"
            style={{ fontSize: 18, letterSpacing: '-0.01em' }}
          >
            n°{numero}
          </div>
        )}
        {numero == null && (
          <div
            className="self-start rounded-lg bg-[#E8C58A] px-[9px] py-[6px] font-serif leading-none text-texte"
            style={{ fontSize: 18, letterSpacing: '-0.01em' }}
          >
            n°1
          </div>
        )}
        <div className="mt-2.5 text-[9px] font-extrabold tracking-[0.12em] text-[#E8C58A]">
          JOURNAL · HEBDO
        </div>
        <div
          className="mt-1 flex-1 font-serif text-[14px] leading-[1.15]"
          style={{ letterSpacing: '-0.01em' }}
        >
          {numero ? `« ${titre} »` : 'À paraître'}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] opacity-60">
          {minutes ? `${minutes} min de lecture` : 'Bientôt en kiosque'}
          <IconChevron size={11} />
        </div>
      </div>
    </button>
  )
}

/* ─── Hero carousel (V2 compact) ─────────────────────────────────────── */

function HubHeroCarousel({
  items, onSelect,
}: {
  items: HeroItem[]
  onSelect: (item: HeroItem) => void
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const pausedUntil = useRef<number>(0)
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tripled = items.length > 1 ? [...items, ...items, ...items] : items
  const loop = items.length > 1

  useEffect(() => {
    if (!loop) return
    const el = scrollerRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = items.length * el.clientWidth
    })
  }, [items.length, loop])

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return
      const el = scrollerRef.current
      if (!el) return
      const slideW = el.clientWidth
      if (!slideW) return
      const currentIdx = Math.round(el.scrollLeft / slideW)
      el.scrollTo({ left: (currentIdx + 1) * slideW, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(t)
  }, [items.length])

  function handleScroll() {
    const el = scrollerRef.current
    if (!el) return
    const slideW = el.clientWidth
    if (!slideW) return
    const physicalIdx = Math.round(el.scrollLeft / slideW)
    const wrapped = ((physicalIdx % items.length) + items.length) % items.length
    if (wrapped !== activeIdx) setActiveIdx(wrapped)

    if (loop) {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
      scrollEndTimer.current = setTimeout(() => {
        const el2 = scrollerRef.current
        if (!el2) return
        const slideW2 = el2.clientWidth
        const idx2 = Math.round(el2.scrollLeft / slideW2)
        if (idx2 >= items.length * 2) {
          el2.scrollLeft = (idx2 - items.length) * slideW2
        } else if (idx2 < items.length) {
          el2.scrollLeft = (idx2 + items.length) * slideW2
        }
      }, 120)
    }
  }

  function handleInteraction() {
    pausedUntil.current = Date.now() + 8000
  }

  return (
    <div className="px-4 pt-[18px]">
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onTouchStart={handleInteraction}
          onMouseDown={handleInteraction}
          onWheel={handleInteraction}
          className="pdv-hscroll flex overflow-x-auto"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {tripled.map((item, idx) => (
            <div
              key={`slide-${idx}`}
              className="min-w-0 shrink-0 grow-0 basis-full snap-start"
            >
              <HeroSlide item={item} onClick={() => onSelect(item)} />
            </div>
          ))}
        </div>

        {/* Dots — top-right */}
        {items.length > 1 && (
          <div className="pointer-events-none absolute right-[22px] top-[14px] flex items-center gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                className={
                  i === activeIdx
                    ? 'h-[4px] w-[14px] rounded-[2px] bg-white'
                    : 'h-[4px] w-[4px] rounded-full bg-white/50'
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HeroSlide({ item, onClick }: { item: HeroItem; onClick: () => void }) {
  // Slide intro : image complète "Bouche-à-oreille" en cover + badge "À LA UNE"
  // SEULEMENT (pas de texte superposé, le texte est dans l'image). Click →
  // onOpenInfo (AppInfoModal). Image custom via config sinon /hub-intro-slide.png.
  if (item.kind === 'intro') {
    const introSrc = item.data.imageUrl || '/hub-intro-slide.webp'
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative block h-[180px] w-full appearance-none rounded-tile border-none p-0 text-left"
        style={{
          WebkitTapHighlightColor: 'transparent',
          background: '#FBF3E6',
        }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-tile">
          <img
            src={introSrc}
            alt="La Place du Village"
            className="h-full w-full"
            style={{ objectFit: 'cover', objectPosition: 'center', userSelect: 'none' }}
          />
        </div>
        <span
          className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary-light/95 px-2.5 py-[5px] text-[10px] font-bold tracking-[0.08em] text-primary"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <IconStar size={11} /> À LA UNE
        </span>
      </button>
    )
  }
  const imagePosition = item.imagePosition ?? '50% 50%'
  if (item.kind === 'evenement') {
    const ev = item.data
    const when = eventWhenLabel(ev.date_debut, ev.date_fin, ev.heure)
    const cat = ev.categorie ? ev.categorie.toUpperCase() : 'ÉVÉNEMENT'
    const venue = ev.lieux?.nom ? ` · ${ev.lieux.nom.toUpperCase()}` : ''
    return (
      <HeroCardShell
        photo={ev.image_url}
        imagePosition={imagePosition}
        onClick={onClick}
        kicker={`${cat}${venue}`}
        title={ev.titre}
        metaLeft={when ? `${when}${ev.heure ? ` · ${ev.heure}` : ''}` : null}
        metaRight={null}
      />
    )
  }
  if (item.kind === 'etablissement') {
    const etab = item.data
    return (
      <HeroCardShell
        photo={etab.photos?.[0] ?? null}
        imagePosition={imagePosition}
        onClick={onClick}
        kicker="ÉTABLISSEMENT"
        title={etab.nom}
        metaLeft={etab.commune ?? null}
        metaRight={null}
        metaLeftIcon="pin"
      />
    )
  }
  if (item.kind === 'forum_topic') {
    const topic = item.data
    // Photo de couverture = 1ère image du média si présente, sinon dégradé.
    const photoItem = topic.media?.find(m => m.t === 'photo')
    const photo = photoItem && photoItem.t === 'photo' ? photoItem.url : null
    return (
      <HeroCardShell
        photo={photo}
        imagePosition={imagePosition}
        onClick={onClick}
        kicker="PLACE PUBLIQUE"
        title={topic.titre}
        metaLeft={null}
        metaRight={null}
      />
    )
  }
  const prod = item.data
  return (
    <HeroCardShell
      photo={prod.photos?.[0] ?? null}
      imagePosition={imagePosition}
      onClick={onClick}
      kicker="PRODUCTEUR LOCAL"
      title={prod.nom}
      metaLeft={prod.commune ?? null}
      metaRight={null}
      metaLeftIcon="pin"
    />
  )
}

function HeroCardShell({
  photo, imagePosition, onClick, kicker, title, metaLeft, metaRight, metaLeftIcon = 'cal',
}: {
  photo: string | null
  imagePosition: string
  onClick: () => void
  kicker: string
  title: string
  metaLeft: string | null
  metaRight: string | null
  metaLeftIcon?: 'cal' | 'pin'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block h-[180px] w-full appearance-none rounded-tile border-none bg-transparent p-0 text-left"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-tile bg-primary"
        style={{ transform: 'translateZ(0)' }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: imagePosition }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary to-[#1A3A2A]" />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.80) 100%)' }}
        />
      </div>

      <span
        className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary-light/95 px-2.5 py-[5px] text-[10px] font-bold tracking-[0.08em] text-primary"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <IconStar size={11} /> À LA UNE
      </span>
      <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
        <div className="text-[10px] font-bold tracking-[0.16em] opacity-90">{kicker}</div>
        <div className="mt-1 font-serif text-[22px] leading-[1.1]">
          {title}
        </div>
        {(metaLeft || metaRight) && (
          <div className="mt-2 flex items-center gap-2.5 text-[11px] text-white/90">
            {metaLeft && (
              <span className="flex items-center gap-1">
                {metaLeftIcon === 'pin' ? <IconPin size={12} /> : <IconCal size={12} />}
                {metaLeft}
              </span>
            )}
            {metaRight && (
              <>
                <span className="opacity-60">·</span>
                <span>{metaRight}</span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

const IconPin = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)
const IconCal = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="3" y="5" width="18" height="16" rx="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="3" x2="8" y2="7"/>
    <line x1="16" y1="3" x2="16" y2="7"/>
  </svg>
)
const IconStar = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>
  </svg>
)
const IconArrow = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="13 6 19 12 13 18"/>
  </svg>
)
const IconChevron = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <polyline points="9 6 15 12 9 18"/>
  </svg>
)
