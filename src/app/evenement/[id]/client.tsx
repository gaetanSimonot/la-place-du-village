'use client'
import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES, eventCategories } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import { imageEvenement } from '@/lib/imageEvenement'
import ImageLightbox from '@/components/ImageLightbox'
import CommentSheet from '@/components/CommentSheet'
import EventEditDrawer from '@/components/EventEditDrawer'
import { useAdminSession } from '@/hooks/useAdminSession'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useFavorites } from '@/hooks/useFavorites'
import PushPromptModal from '@/components/PushPromptModal'
import FeatureButton from '@/components/FeatureButton'
import BottomNavBar from '@/components/BottomNavBar'
import FeedbackButton from '@/components/FeedbackButton'
import { useSmartBack } from '@/hooks/useSmartBack'
import { authedFetch } from '@/lib/swr-fetchers'
import type { CorrectionField } from '@/lib/types'
import { texteBrut } from '@/components/TexteRiche'

const LINK_STYLE = { color: '#C84B2F', textDecoration: 'underline', wordBreak: 'break-all' } as const

function linkify(text: string): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/g
  const nodes: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const raw = m[0]
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    nodes.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{raw}</a>)
    last = m.index + raw.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
}

function renderContact(contact: string): React.ReactNode {
  const s = contact.trim()
  if (/^https?:\/\//i.test(s))
    return <a href={s} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{s.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
  if (/^www\.[^\s]+$/.test(s))
    return <a href={`https://${s}`} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{s}</a>
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    return <a href={`mailto:${s}`} style={LINK_STYLE}>{s}</a>
  if (/^[\d\s+\-().]{6,}$/.test(s))
    return <a href={`tel:${s.replace(/[\s\-().]/g, '')}`} style={LINK_STYLE}>{s}</a>
  return <>{linkify(s)}</>
}

/* ─── Page principale ─────────────────────────────────────────────────── */

export default function EvenementPageClient({ id }: { id: string }) {
  const [evt, setEvt]           = useState<Evenement | null>(null)
  const [linkedEtab, setLinkedEtab] = useState<{ id: string; nom: string; description_courte: string | null; photos: string[] | null; commune: string | null; user_id?: string | null } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]       = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [proposing, setProposing]   = useState(false)   // user propose une correction
  const [thanksOpen, setThanksOpen] = useState(false)   // confirmation après envoi
  const [reviewCorrection, setReviewCorrection] = useState<
    { id: string; changes: Record<string, unknown>; changedFields: CorrectionField[]; proposeurNom: string | null } | null
  >(null)
  const isAdmin = useAdminSession()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const goBack = useSmartBack('/')

  // Admin arrivant depuis une notif "correction proposée" (?correction=…) :
  // on charge la première correction en attente et on ouvre le modal en revue.
  useEffect(() => {
    if (!isAdmin) return
    const hasParam = new URLSearchParams(window.location.search).has('correction')
    if (!hasParam) return
    let cancelled = false
    ;(async () => {
      const r = await authedFetch(`/api/admin/evenements/${id}/corrections`).catch(() => null)
      if (!r || !r.ok || cancelled) return
      const d = await r.json().catch(() => ({}))
      const c = (d.corrections ?? [])[0]
      if (c) setReviewCorrection({ id: c.id, changes: c.changes, changedFields: c.changed_fields, proposeurNom: c.proposeur_nom })
    })()
    return () => { cancelled = true }
  }, [isAdmin, id])

  useEffect(() => {
    supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          setEvt(data as Evenement)
          // Établissement lié → encart "L'endroit" (requête séparée : pas de
          // jointure implicite PostgREST, cf. règle projet).
          const etabId = (data as Evenement & { etablissement_id?: string | null }).etablissement_id
          if (etabId) {
            supabase.from('etablissements')
              .select('id, nom, description_courte, photos, commune, user_id')
              .eq('id', etabId).maybeSingle()
              .then(({ data: e }) => { if (e) setLinkedEtab(e) })
          }
        }
        setLoading(false)
      })
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('evenement_id', id)
      .then(({ count }) => setCommentCount(count ?? 0))
  }, [id])

  if (loading) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-creme">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
    </div>
  )
  if (!evt) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-creme font-inter">
      <p className="text-texte-doux">Événement introuvable</p>
    </div>
  )

  // La fiche ne signe l'événement que si elle appartient au soumetteur.
  const signeParFiche =
    linkedEtab && evt.submitted_by && linkedEtab.user_id === evt.submitted_by
      ? linkedEtab
      : null

  const cats  = eventCategories(evt)
  const cat   = CATEGORIES[cats[0]] ?? CATEGORIES.autre
  const imageDeRepli = imageEvenement(evt)   // null si l'événement a sa propre image
  const lieu  = evt.lieux
  const mapsUrl = lieu?.lat && lieu?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lieu.lat},${lieu.lng}`
    : lieu?.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lieu.adresse)}`
    : null

  const handleShare = async () => {
    const url = `${window.location.origin}/evenement/${evt.id}`
    if (navigator.share) {
      try { await navigator.share({ title: evt.titre, text: evt.titre, url }) } catch {}
    } else {
      await navigator.clipboard.writeText(url).catch(() => {})
    }
  }

  return (
    <div className="relative min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* ── Hero photo + floating actions ──
          h-[220px] = même hauteur que ImageLightbox img height:220px. Avec
          h-[300px] avant, l'image laissait 80px de vide en bas (fond
          bg-[#F0EBE3] visible) où atterrissait le badge catégorie → effet
          "bande grise" entre image et card blanche. */}
      <div className="pcv-fiche-hero relative h-[220px] w-full overflow-hidden bg-[#F0EBE3]">
        {evt.image_url ? (
          <ImageLightbox src={evt.image_url} alt={evt.titre} objectPosition={evt.image_position ?? '50% 50%'} />
        ) : imageDeRepli ? (
          /* Illustration générique de la catégorie : pas de lightbox, ce n'est
             pas une photo de CET événement — l'agrandir n'apprendrait rien. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageDeRepli} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: `linear-gradient(135deg, ${cat.color} 0%, #1A3A2A 100%)` }}
          />
        )}
        {/* Bottom gradient */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px]"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%)' }}
        />
        {/* Floating top actions */}
        <FloatingTopActions
          onBack={goBack}
          adminExtra={isAdmin ? (
            <div className="flex items-center gap-2">
              <FeatureButton contentType="evenement" contentId={id} ownerUserId={(evt as { user_id?: string | null }).user_id ?? null} />
              <button
                onClick={() => setEditing(true)}
                aria-label="Éditer"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-none bg-white/92 text-texte shadow-[0_2px_8px_rgba(0,0,0,0.15)] backdrop-blur"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
              </button>
            </div>
          ) : null}
        />
        {/* Type badge(s) bottom-left — montée un peu pour ne pas coller la coupe */}
        <div className="absolute bottom-7 left-3.5 z-[3] flex flex-wrap gap-1">
          {cats.map(c => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-primary-light/95 px-2.5 py-[5px] text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary"
              style={{ backdropFilter: 'blur(4px)' }}
            >
              {(CATEGORIES[c] ?? CATEGORIES.autre).label}
            </span>
          ))}
        </div>
      </div>

      {/* ── ContentCard sliding up ── */}
      <div className="relative z-[4] -mt-5 rounded-t-[24px] bg-white pb-6">
        {/* Title block */}
        <div className="px-4 pt-[18px]">
          <h1
            className="m-0 font-title text-[28px] leading-[1.05] text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            {evt.titre}
          </h1>
          {/* Blase : si la fiche liée appartient au soumetteur, c'est ELLE qui
              signe l'événement. Un rattachement de lieu posé par un admin ne
              signe rien : le profil reste affiché. */}
          {signeParFiche ? (
            <p className="mt-2 text-[11px] text-texte-tres-doux">
              Proposé par{' '}
              <Link href={`/etablissement/${signeParFiche.id}`} className="font-semibold text-accent hover:underline">
                {signeParFiche.nom}
              </Link>
            </p>
          ) : evt.submitted_by && evt.submitted_by_name ? (
            <p className="mt-2 text-[11px] text-texte-tres-doux">
              Proposé par{' '}
              <Link href={`/profil/${evt.submitted_by}`} className="font-semibold text-accent hover:underline">
                {evt.submitted_by_name}
              </Link>
            </p>
          ) : null}
        </div>

        {/* Info cards stack */}
        <div className="flex flex-col gap-2.5 px-4 pt-[18px]">
          {evt.date_debut && (
            <InfoCard
              icon={<IconCalendarLg />}
              title={formatDate(evt.date_debut, 'long') + (evt.heure ? ` · ${evt.heure.slice(0,5)}` : '')}
              subtitle={evt.date_fin && evt.date_fin !== evt.date_debut ? `Jusqu'au ${formatDate(evt.date_fin, 'long')}` : undefined}
            />
          )}
          {lieu && (
            <InfoCard
              icon={<IconPinLg />}
              title={lieu.nom ?? 'Lieu'}
              subtitle={lieu.adresse ?? lieu.commune ?? undefined}
              action={mapsUrl ? 'Itinéraire' : undefined}
              actionHref={mapsUrl ?? undefined}
              warning={isApproxLocation(lieu) ? 'Localisation approximative' : undefined}
            />
          )}
          {evt.prix && (
            <InfoCard
              icon={<IconTicket />}
              title={evt.prix}
            />
          )}
        </div>

        {/* Social action bar */}
        <ActionBar evt={evt} commentCount={commentCount} onCommentOpen={() => setCommentsOpen(true)} onShare={handleShare} />

        {/* Description */}
        {evt.description && (
          <>
            <div className="h-[22px]" />
            <Divider />
            <div className="px-4 pt-[18px]">
              <div className="mb-2 text-[11px] font-extrabold tracking-[0.1em] text-texte-doux">À PROPOS</div>
              <p className="pcv-fiche-corps m-0 whitespace-pre-wrap text-[14px] leading-[1.6] text-texte">
                {linkify(evt.description)}
              </p>
            </div>
          </>
        )}

        {/* L'endroit — établissement lié à l'événement */}
        {linkedEtab && (
          <>
            <div className="h-[22px]" />
            <Divider />
            <div className="px-4 pt-[18px]">
              <div className="mb-2 text-[11px] font-extrabold tracking-[0.1em] text-texte-doux">L&apos;ENDROIT</div>
              <Link
                href={`/etablissement/${linkedEtab.id}`}
                className="flex items-center gap-3 rounded-2xl border p-3 no-underline"
                style={{ borderColor: '#E8E0D4', backgroundColor: '#FAF7F2', color: 'inherit' }}
              >
                {linkedEtab.photos?.[0] ? (
                  <img src={linkedEtab.photos[0]} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#E8F2EB] text-primary">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/></svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[14px] font-extrabold text-texte">{linkedEtab.nom}</p>
                  {linkedEtab.description_courte && (
                    <p className="m-0 mt-0.5 text-[12px] leading-[1.4] text-texte-doux" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{texteBrut(linkedEtab.description_courte)}</p>
                  )}
                  <span className="mt-1 inline-block text-[11px] font-bold text-primary">Voir la fiche →</span>
                </div>
              </Link>
            </div>
          </>
        )}

        {/* Contact */}
        {(evt.contact || evt.organisateurs) && (
          <>
            <div className="h-[22px]" />
            <Divider />
            <div className="px-4 pt-[18px]">
              <div className="mb-2 text-[11px] font-extrabold tracking-[0.1em] text-texte-doux">CONTACT</div>
              <div className="flex flex-col gap-1.5 text-[14px] text-texte">
                {evt.organisateurs && <p className="m-0">{renderContact(evt.organisateurs)}</p>}
                {evt.contact && <p className="m-0">{renderContact(evt.contact)}</p>}
              </div>
            </div>
          </>
        )}

        {evt.source && /^https?:\/\//i.test(evt.source) && (
          <>
            <div className="h-[22px]" />
            <Divider />
            <div className="px-4 pt-[18px]">
              <a
                href={evt.source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-semibold text-accent underline"
                style={{ wordBreak: 'break-all' }}
              >
                Voir la source originale
              </a>
            </div>
          </>
        )}

        <div className="h-7" />
      </div>

      {/* Sticky bottom bar retirée — Partager dispo dans ActionBar et
          "Itinéraire" dispo sur l'InfoCard du lieu. Plus de doublon. */}

      {/* Commentaires */}
      <CommentSheet
        evenementId={evt.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentCount}
      />

      {/* Proposer une correction (édite la fiche) + signalement texte secondaire */}
      <div className="flex flex-col items-center gap-1.5 px-6 pb-6 pt-2">
        <button
          onClick={() => { if (!user) { openAuthModal(); return } setProposing(true) }}
          className="border-none bg-transparent text-[12px] font-semibold text-primary underline"
        >
          Proposer une correction
        </button>
        <button
          onClick={() => setFeedbackOpen(true)}
          className="border-none bg-transparent text-[11px] text-texte-doux underline"
        >
          Signaler un autre problème
        </button>
      </div>

      <FeedbackButton
        evenementId={evt.id}
        evenementTitre={evt.titre}
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />

      {/* Modal d'édition — proposition de correction par l'utilisateur */}
      {proposing && (
        <EventEditDrawer
          evenementId={evt.id}
          proposalMode
          onClose={() => setProposing(false)}
          onSaved={() => { setProposing(false); setThanksOpen(true) }}
        />
      )}

      {/* Modal d'édition — revue admin d'une correction proposée */}
      {reviewCorrection && (
        <EventEditDrawer
          evenementId={evt.id}
          reviewProposal={reviewCorrection}
          onClose={() => setReviewCorrection(null)}
          onSaved={() => {
            setReviewCorrection(null)
            supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
              .then(({ data }) => { if (data) setEvt(data as Evenement) })
          }}
        />
      )}

      {/* Confirmation après envoi d'une correction */}
      {thanksOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setThanksOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="m-0 text-[34px] leading-none">🙏</p>
            <h3 className="mt-2.5 mb-1.5 font-serif text-[18px] text-texte">Merci !</h3>
            <p className="m-0 text-[13px] leading-[1.5] text-texte-doux">
              Ta correction a bien été envoyée. Un modérateur la valide au plus vite.
            </p>
            <button
              onClick={() => setThanksOpen(false)}
              className="mt-4 w-full rounded-xl border-none bg-primary py-3 text-[14px] font-bold text-white"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EventEditDrawer
          evenementId={evt.id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
              .then(({ data }) => { if (data) setEvt(data as Evenement) })
          }}
        />
      )}
      {/* Demande d'activation des notifications, posée là où elle a du sens :
          on consulte une sortie, on peut se la faire rappeler la veille.
          Le délai laisse le temps de voir l'événement avant d'interrompre. */}
      <PushPromptModal reason="event" delayMs={3000} />
      <BottomNavBar />
    </div>
  )
}

/* ─── Floating top actions ────────────────────────────────────────────── */

function FloatingTopActions({ onBack, adminExtra }: { onBack: () => void; adminExtra?: React.ReactNode }) {
  return (
    <div className="absolute left-0 right-0 top-12 z-[6] flex items-center justify-between px-3.5">
      <button
        onClick={onBack}
        aria-label="Retour"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-none bg-white text-texte shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      {adminExtra && (
        <div className="flex items-center gap-2">
          {adminExtra}
        </div>
      )}
    </div>
  )
}

/* ─── InfoCard (date / lieu / prix) ───────────────────────────────────── */

function InfoCard({
  icon, title, subtitle, action, actionHref, warning,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: string
  actionHref?: string
  warning?: string
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border bg-white px-3.5 py-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
      style={{ borderColor: '#F0EAE0' }}
    >
      <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-cremeDeep text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold leading-[1.2] text-texte">{title}</div>
        {subtitle && (
          <div className="mt-0.5 truncate text-[11px] text-texte-doux">{subtitle}</div>
        )}
        {warning && (
          <div className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
            {warning}
          </div>
        )}
      </div>
      {action && actionHref && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-cremeDeep px-3 py-1.5 text-[11px] font-bold text-primary no-underline"
        >
          {action}
        </a>
      )}
    </div>
  )
}

/* ─── Divider ─────────────────────────────────────────────────────────── */

function Divider() {
  return <div className="my-1 h-px" style={{ background: '#F0EAE0' }} />
}

/* ─── ActionBar V3 (Favori / Partager / Intéressé / Commenter / Utile) ── */

function ActionBar({
  evt, commentCount, onCommentOpen, onShare,
}: {
  evt: Evenement
  commentCount: number
  onCommentOpen: () => void
  onShare: () => void
}) {
  const { isFav, toggle: toggleFav } = useFavorites()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [voted, setVoted]                   = useState(false)
  const [voteCount, setVoteCount]           = useState(evt.vote_count ?? 0)
  const [voteLoading, setVoteLoading]       = useState(false)
  const [interested, setInterested]         = useState(false)
  const [interestCount, setInterestCount]   = useState(0)
  const [interestLoading, setInterestLoading] = useState(false)
  const [voters, setVoters]                 = useState<{ id: string; name: string }[] | null>(null)
  const [loadingVoters, setLoadingVoters]   = useState(false)
  const lpTimer   = useRef<ReturnType<typeof setTimeout>>()
  const lpFired   = useRef(false)
  const fav       = isFav(evt.id)

  useEffect(() => {
    if (!user) return
    supabase.from('votes').select('id').eq('evenement_id', evt.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setVoted(!!data))
  }, [user, evt.id])

  useEffect(() => {
    supabase.from('interests').select('id', { count: 'exact' }).eq('evenement_id', evt.id)
      .then(({ count }) => setInterestCount(count ?? 0))
    if (!user) return
    supabase.from('interests').select('id').eq('evenement_id', evt.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setInterested(!!data))
  }, [user, evt.id])

  const handleInterest = async () => {
    if (!user) { openAuthModal(); return }
    if (interestLoading) return
    setInterestLoading(true)
    if (interested) {
      await supabase.from('interests').delete().eq('evenement_id', evt.id).eq('user_id', user.id)
      setInterested(false)
      setInterestCount(p => Math.max(0, p - 1))
    } else {
      await supabase.from('interests').insert({ evenement_id: evt.id, user_id: user.id })
      setInterested(true)
      setInterestCount(p => p + 1)
    }
    setInterestLoading(false)
  }

  const handleVote = async () => {
    if (lpFired.current) return
    if (!user) { openAuthModal(); return }
    if (voteLoading) return
    setVoteLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ evenement_id: evt.id }),
    })
    const d = await res.json()
    if (res.ok) { setVoted(d.voted); setVoteCount(d.vote_count) }
    setVoteLoading(false)
  }

  const fetchVoters = async () => {
    setVoters([])
    setLoadingVoters(true)
    const { data: voteData } = await supabase.from('votes').select('user_id').eq('evenement_id', evt.id)
    const ids = (voteData ?? []).map((v: { user_id: string }) => v.user_id)
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids)
      setVoters(((profiles ?? []) as { user_id: string; display_name: string | null }[])
        .map(p => ({ id: p.user_id, name: p.display_name || 'Quelqu\'un' })))
    }
    setLoadingVoters(false)
  }

  const lpStart = (cb: () => void) => (e: React.PointerEvent) => {
    e.preventDefault(); lpFired.current = false
    lpTimer.current = setTimeout(() => { lpFired.current = true; cb() }, 550)
  }
  const lpEnd = () => {
    clearTimeout(lpTimer.current)
    setTimeout(() => { lpFired.current = false }, 60)
  }

  return (
    <>
      <div className="px-4 pt-[18px]">
        <div
          className="flex items-stretch overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
          style={{ borderColor: '#F0EAE0' }}
        >
          <ActionBtn
            label="Intéressé"
            count={interestCount}
            active={interested}
            disabled={interestLoading}
            onClick={handleInterest}
            icon={(active) => (
              <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            )}
          />
          <Sep />
          <ActionBtn
            label="Partager"
            onClick={onShare}
            icon={() => (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            )}
          />
          <Sep />
          <ActionBtn
            label="Commenter"
            count={commentCount}
            onClick={onCommentOpen}
            icon={() => (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            )}
          />
          <Sep />
          <ActionBtnLP
            label="Utile"
            count={voteCount}
            active={voted}
            disabled={voteLoading}
            onClick={handleVote}
            onLongPress={fetchVoters}
            lpStart={lpStart}
            lpEnd={lpEnd}
            icon={(active) => (
              <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/>
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            )}
          />
          <Sep />
          <ActionBtn
            label="Favori"
            active={fav}
            activeColor="#D93B3B"
            onClick={() => toggleFav(evt.id)}
            icon={(active) => (
              // En favori : cœur plein rouge + une petite cloche, pour dire
              // d'un coup d'œil que l'événement sera rappelé la veille.
              <span className="relative inline-flex">
                <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                {active && (
                  <span
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ top: -4, right: -6, width: 13, height: 13, background: '#fff' }}
                    aria-hidden
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D93B3B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                    </svg>
                  </span>
                )}
              </span>
            )}
          />
        </div>
      </div>

      {/* Popup voters (long press 👍) */}
      {voters !== null && (
        <>
          <div onClick={() => setVoters(null)} className="fixed inset-0 z-[200] bg-black/35" />
          <div className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[20px] bg-white px-5 pb-11 pt-4 font-inter">
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[#D1CCC4]" />
            <p className="mb-3.5 text-[15px] font-bold text-texte">
              {voteCount} personne{voteCount !== 1 ? 's' : ''} trouve ça utile
            </p>
            {loadingVoters ? (
              <div className="py-2 text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-[3px] border-bord border-t-primary" />
              </div>
            ) : voters.length === 0 ? (
              <p className="text-[13px] text-texte-doux">Personne pour l&apos;instant.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {voters.map((p, i) => (
                  <Link
                    key={i}
                    href={`/profil/${p.id}`}
                    onClick={() => setVoters(null)}
                    className="flex items-center gap-2.5 text-[14px] text-texte no-underline"
                  >
                    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary-light text-[14px] font-extrabold text-primary">
                      {p.name[0].toUpperCase()}
                    </div>
                    {p.name}
                  </Link>
                ))}
              </div>
            )}
            <button
              onClick={() => setVoters(null)}
              className="mt-4 w-full rounded-2xl border-none bg-cremeDeep py-3 text-[14px] font-semibold text-texte-doux"
            >
              Fermer
            </button>
          </div>
        </>
      )}
    </>
  )
}

function ActionBtn({
  label, count, active, disabled, onClick, icon, activeColor,
}: {
  label:    string
  count?:   number
  active?:  boolean
  disabled?:boolean
  onClick:  () => void
  icon:     (active: boolean) => React.ReactNode
  /** Couleur quand actif. Par défaut le vert primaire du reste de la barre. */
  activeColor?: string
}) {
  const activeStyle = active && activeColor ? { color: activeColor } : undefined
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={activeStyle}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-none bg-transparent px-1 py-3 ${
        active ? (activeColor ? '' : 'text-primary') : 'text-texte'
      }`}
    >
      {icon(!!active)}
      <span style={activeStyle} className={`text-[10px] font-semibold leading-none ${active ? (activeColor ? '' : 'text-primary') : 'text-texte-doux'}`}>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span style={activeStyle} className={`text-[10px] font-bold leading-none ${active ? (activeColor ? '' : 'text-primary') : 'text-texte'}`}>{count}</span>
      )}
    </button>
  )
}

function ActionBtnLP(props: React.ComponentProps<typeof ActionBtn> & {
  onLongPress: () => void
  lpStart: (cb: () => void) => (e: React.PointerEvent) => void
  lpEnd: () => void
}) {
  const { onLongPress, lpStart, lpEnd, ...rest } = props
  return (
    <button
      onClick={rest.onClick}
      disabled={rest.disabled}
      onPointerDown={lpStart(onLongPress)}
      onPointerUp={lpEnd}
      onPointerCancel={lpEnd}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-none bg-transparent px-1 py-3 ${
        rest.active ? 'text-primary' : 'text-texte'
      }`}
    >
      {rest.icon(!!rest.active)}
      <span className={`text-[10px] font-semibold leading-none ${rest.active ? 'text-primary' : 'text-texte-doux'}`}>{rest.label}</span>
      {typeof rest.count === 'number' && rest.count > 0 && (
        <span className={`text-[10px] font-bold leading-none ${rest.active ? 'text-primary' : 'text-texte'}`}>{rest.count}</span>
      )}
    </button>
  )
}

function Sep() {
  return <div className="w-px self-stretch" style={{ background: '#F0EAE0', margin: '10px 0' }} />
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

const IconCalendarLg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="3" x2="8" y2="7"/>
    <line x1="16" y1="3" x2="16" y2="7"/>
  </svg>
)
const IconPinLg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)
const IconTicket = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/>
    <line x1="13" y1="5" x2="13" y2="19"/>
  </svg>
)
