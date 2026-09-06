'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import PostMedia from '@/components/profil/PostMedia'
import type { MediaItem } from '@/lib/postMedia'
import { EMBED_DISPARU, type EmbedSnapshot } from '@/lib/embedSnapshot'
import TexteRiche from '@/components/TexteRiche'

export interface PostData {
  id:           string
  user_id:      string
  /** Blase : fiche sous laquelle le post est publié (null = profil perso). */
  etablissement_id?: string | null
  texte:        string
  visibility:   'public' | 'amis' | 'prive'
  created_at:   string
  embed_kind?:  string | null
  embed_ref_id?: string | null
  /** Copie figée de la vignette, prise à la publication (cf. embedSnapshot). */
  embed_snapshot?: EmbedSnapshot | null
  media?:       MediaItem[] | null
}

interface Props {
  post:           PostData
  authorName:     string
  authorAvatar:   string | null
  /** Page de l'auteur affiché : profil perso, ou fiche si le post est blasé. */
  authorHref?:    string
  isOwn:          boolean
  likeCount:      number
  commentCount:   number
  userHasLiked:   boolean
  onToggleLike:   () => void
  onDelete:       () => Promise<void> | void
  onComment:      () => void
}

export default function PostCard({
  post, authorName, authorAvatar, authorHref, isOwn,
  likeCount, commentCount, userHasLiked,
  onToggleLike, onDelete, onComment,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = (authorName || '·').trim().charAt(0).toUpperCase() || '·'

  async function handleDelete() {
    setMenuOpen(false)
    if (!confirm('Supprimer cette publication ?')) return
    await onDelete()
  }

  function handleSignal() {
    setMenuOpen(false)
    toast('Signalement noté', { description: 'Notre équipe va revoir cette publication.' })
  }

  async function handleShare() {
    // Si la publication porte un lien (carte filtrée, vidéo, article…), on
    // partage CE lien plutôt que le profil de l'auteur.
    const linkItem = post.media?.find(m => m.t === 'link' || m.t === 'youtube')
    const url = linkItem
      ? (linkItem.t === 'youtube' ? `https://youtu.be/${linkItem.id}` : linkItem.url)
      : (typeof window !== 'undefined'
          ? `${window.location.origin}${authorHref ?? `/profil/${post.user_id}`}`
          : '')
    const text = post.texte.length > 120 ? `${post.texte.slice(0, 120)}…` : post.texte
    const data: ShareData = { title: 'La Place du Village', text, url }
    try {
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data)
        return
      }
    } catch (e) {
      // utilisateur a annulé ou navigator.share a échoué — on tombe sur le fallback
      if (e instanceof Error && e.name === 'AbortError') return
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        toast.success('Lien copié dans le presse-papier')
      }
    } catch {
      toast.error('Impossible de partager')
    }
  }

  return (
    <article
      className="overflow-hidden rounded-[16px] border bg-white"
      style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        {authorAvatar ? (
          <img src={authorAvatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[14px] text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
            {authorName}
          </div>
          <div className="mt-[1px] flex items-center gap-1 text-[11px] text-texte-doux">
            {formatDate(post.created_at)}
            <span aria-hidden>·</span>
            <VisibilityIcon visibility={post.visibility} />
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Options"
            className="-mt-1 -mr-1 flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-texte-doux"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                className="absolute right-0 top-8 z-[110] w-[160px] overflow-hidden rounded-[12px] border bg-white"
                style={{ borderColor: '#E8E0D4', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
              >
                {isOwn ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 bg-transparent px-3 py-2.5 text-left text-[12.5px] font-bold"
                    style={{ color: '#B53A22' }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                    Supprimer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignal}
                    className="flex w-full items-center gap-2 bg-transparent px-3 py-2.5 text-left text-[12.5px] font-bold text-texte"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="21" x2="4" y2="3" />
                      <path d="M4 3h13l-2 7 2 7H4" />
                    </svg>
                    Signaler
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Texte — rendu comme les fiches, pour que les marques posées par la
          baguette (gras, listes, titres) s'affichent au lieu de rester en
          clair. Un texte sans marque rend exactement comme avant : TexteRiche
          conserve les retours à la ligne et les paragraphes. */}
      {post.texte && (
        <div className="px-3.5 pb-3 pt-2 text-[14px] leading-[1.55] text-texte" style={{ wordBreak: 'break-word' }}>
          <TexteRiche texte={post.texte} />
        </div>
      )}

      {/* Médias (photos / vidéo YouTube / lien) */}
      {post.media && post.media.length > 0 && (
        <div className={`px-3.5 pb-3 ${post.texte ? '' : 'pt-2'}`}>
          <PostMedia media={post.media} />
        </div>
      )}

      {/* Embed mini-card (élément du village lié) */}
      {post.embed_kind && post.embed_ref_id && (
        <div className="px-3.5 pb-3">
          <PostEmbedRender kind={post.embed_kind} refId={post.embed_ref_id} snapshot={post.embed_snapshot ?? null} />
        </div>
      )}

      {/* Footer compteurs + actions */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 text-[11px] text-texte-doux" style={{ borderTop: '1px solid #F0EAE0' }}>
        <span>{likeCount > 0 && <>{likeCount} j&apos;aime</>}</span>
        {commentCount > 0 && (
          <button
            type="button"
            onClick={onComment}
            className="bg-transparent text-[11px] text-texte-doux"
          >
            {commentCount} commentaire{commentCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3" style={{ borderTop: '1px solid #F0EAE0' }}>
        <ActionBtn
          onClick={onToggleLike}
          active={userHasLiked}
          activeColor="#C84B2F"
          label="J'aime"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill={userHasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          }
        />
        <ActionBtn
          onClick={onComment}
          active={false}
          label="Commenter"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          }
        />
        <ActionBtn
          onClick={handleShare}
          active={false}
          label="Partager"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          }
        />
      </div>
    </article>
  )
}

function ActionBtn({
  onClick, active, activeColor, label, icon,
}: {
  onClick: () => void
  active:  boolean
  activeColor?: string
  label:   string
  icon:    React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 bg-transparent py-2.5 text-[12.5px]"
      style={{
        color:      active && activeColor ? activeColor : '#7A6A5A',
        fontWeight: active ? 800 : 700,
      }}
    >
      {icon} {label}
    </button>
  )
}

function VisibilityIcon({ visibility }: { visibility: 'public' | 'amis' | 'prive' }) {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-label={visibility}>
      {visibility === 'public' && <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}
      {visibility === 'amis'   && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>}
      {visibility === 'prive'  && <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
    </svg>
  )
}

/* ── Embed render : fetch l'élément lié + mini-card cliquable ───────── */
interface EmbedDetails {
  title:    string
  subtitle: string | null
  photo:    string | null
  href:     string
}

const EMBED_LABEL: Record<string, string> = {
  event: 'Événement', etab: 'Établissement', producer: 'Producteur',
  annonce: 'Annonce', promo: 'Promotion', covoit: 'Covoiturage', article: 'Article du Journal',
}

export function PostEmbedRender({ kind, refId, variant = 'compact', snapshot = null }: {
  kind: string; refId: string; variant?: 'compact' | 'large'; snapshot?: EmbedSnapshot | null
}) {
  // La copie figée sert d'affichage immédiat : la vignette est là dès le
  // premier rendu, sans squelette clignotant, et elle reste si l'élément a
  // depuis disparu du village.
  const depuisCopie = (s: EmbedSnapshot): EmbedDetails =>
    ({ title: s.t, subtitle: s.s, photo: s.p, href: '' })

  const [details, setDetails] = useState<EmbedDetails | null>(snapshot ? depuisCopie(snapshot) : null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (kind === 'event') {
          const { data } = await supabase.from('evenements').select('id, titre, image_url, date_debut, lieux(commune)').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          const lieuRaw = (data as { lieux?: { commune?: string | null } | { commune?: string | null }[] | null }).lieux
          const lieu = Array.isArray(lieuRaw) ? lieuRaw[0] : lieuRaw
          if (!cancelled) setDetails({ title: data.titre as string, subtitle: lieu?.commune ?? null, photo: (data.image_url as string | null) ?? null, href: `/evenement/${refId}` })
        } else if (kind === 'etab') {
          const { data } = await supabase.from('etablissements').select('id, nom, commune, photos').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.nom as string, subtitle: (data.commune as string | null) ?? null, photo: ((data.photos as string[] | null) ?? [])[0] ?? null, href: `/etablissement/${refId}` })
        } else if (kind === 'producer') {
          const { data } = await supabase.from('producers').select('id, nom, commune, photos').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.nom as string, subtitle: (data.commune as string | null) ?? null, photo: ((data.photos as string[] | null) ?? [])[0] ?? null, href: `/producteur/${refId}` })
        } else if (kind === 'annonce') {
          // Pas de colonne 'prix' sur annonces (prix_initial / prix_seuil)
          const { data } = await supabase.from('annonces').select('id, titre, photos, type, categorie').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.titre as string, subtitle: (data.categorie as string | null) ?? (data.type as string | null) ?? null, photo: ((data.photos as string[] | null) ?? [])[0] ?? null, href: `/annonces/${refId}` })
        } else if (kind === 'promo') {
          // Promotions : colonne "title" (pas "titre" comme annonces/events)
          const { data } = await supabase.from('promotions').select('id, title, image_url').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: (data.title as string | null) ?? 'Promotion', subtitle: null, photo: (data.image_url as string | null) ?? null, href: `/promotions` })
        } else if (kind === 'covoit') {
          // Table 'covoiturages' (avec s), depart/destination/date_trajet
          const { data } = await supabase.from('covoiturages').select('id, depart, destination, date_trajet').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          const sub = data.date_trajet ? new Date(data.date_trajet as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null
          if (!cancelled) setDetails({ title: `${data.depart} → ${data.destination}`, subtitle: sub, photo: null, href: `/covoiturage/${refId}` })
        } else if (kind === 'debat') {
          const { data } = await supabase.from('forum_topics').select('id, titre, corps, media').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          const corps = String((data.corps as string | null) ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          const media = Array.isArray(data.media) ? (data.media as Array<{ t?: string; url?: unknown }>) : []
          const photo = media.find(m => m?.t === 'photo' && typeof m.url === 'string')?.url as string | undefined
          if (!cancelled) setDetails({
            title: data.titre as string,
            subtitle: corps ? (corps.length > 80 ? corps.slice(0, 80).trimEnd() + '…' : corps) : null,
            photo: photo ?? null,
            href: `/forum/${refId}`,
          })
        } else if (kind === 'article') {
          const { data } = await supabase.from('articles_journal').select('id, titre, corps, photo_url').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          const corps = String((data.corps as string | null) ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          const sub = corps ? (corps.length > 80 ? corps.slice(0, 80).trimEnd() + '…' : corps) : null
          if (!cancelled) setDetails({ title: data.titre as string, subtitle: sub, photo: (data.photo_url as string | null) ?? null, href: `/journal/articles/${refId}/view` })
        }
      } catch {
        if (!cancelled) setNotFound(true)
      }
    })()
    return () => { cancelled = true }
  }, [kind, refId])

  // Élément disparu ET aucune copie (publications antérieures à la copie
  // figée) : on le dit selon le type. Un événement purgé n'a pas été
  // « supprimé », il est passé — l'écrire autrement laisse croire à une
  // modération et discrédite la publication.
  if (notFound && !snapshot) {
    return (
      <div className="rounded-[12px] border bg-cremeDeep px-3 py-2 text-[11.5px] italic text-texte-doux" style={{ borderColor: '#E8E0D4' }}>
        {EMBED_DISPARU[kind] ?? 'N’est plus disponible'}
      </div>
    )
  }

  // Disparu mais copié : la vignette reste lisible, sans lien vers le vide.
  const disparu = notFound

  /** Cliquable tant que l'élément existe ; simple bloc une fois disparu. */
  const Enveloppe = ({ className, style, children }: {
    className: string; style: React.CSSProperties; children: React.ReactNode
  }) => disparu
    ? <div className={className} style={{ ...style, opacity: 0.75 }}>{children}</div>
    : <Link href={details!.href} onClick={e => e.stopPropagation()} className={className} style={style}>{children}</Link>

  if (!details) {
    if (variant === 'large') {
      return (
        <div className="overflow-hidden rounded-[14px] border bg-cremeDeep" style={{ borderColor: '#E8E0D4' }}>
          <div className="w-full animate-pulse bg-bord" style={{ aspectRatio: '16 / 9' }} />
          <div className="space-y-1.5 px-3 py-2.5">
            <div className="h-3 w-1/2 animate-pulse rounded bg-bord" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-bord" />
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2.5 rounded-[12px] border bg-cremeDeep px-2.5 py-2" style={{ borderColor: '#E8E0D4' }}>
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-[8px] bg-bord" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-bord" />
          <div className="h-2 w-1/3 animate-pulse rounded bg-bord" />
        </div>
      </div>
    )
  }

  // Variante "large" — grande image en haut (style Facebook), carte cliquable
  if (variant === 'large') {
    return (
      <Enveloppe
        className="block overflow-hidden rounded-[14px] border bg-white text-inherit no-underline"
        style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 5px rgba(44,28,16,0.06)' }}
      >
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#EFE8DD' }}>
          {details.photo
            ? <img src={details.photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9BBA8' }}>
                <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>}
          <span style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 999, background: 'rgba(26,18,9,0.72)', color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {EMBED_LABEL[kind] ?? kind}
          </span>
          {disparu && (
            <span style={{ position: 'absolute', bottom: 10, left: 10, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', color: '#6B5E4E', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
              {EMBED_DISPARU[kind] ?? 'N’est plus disponible'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1209', letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{details.title}</div>
            {details.subtitle && <div style={{ fontSize: 11.5, color: '#7A6A5A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{details.subtitle}</div>}
          </div>
          {!disparu && (
            <span style={{ color: '#C9BBA8', flexShrink: 0 }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
            </span>
          )}
        </div>
      </Enveloppe>
    )
  }

  return (
    <Enveloppe
      className="flex items-center gap-2.5 rounded-[12px] border bg-cremeDeep px-2.5 py-2 text-inherit no-underline"
      style={{ borderColor: '#E8E0D4' }}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-primary-light text-primary">
        {details.photo
          ? <img src={details.photo} alt="" className="h-full w-full object-cover" />
          : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9.5px] font-extrabold uppercase text-primary" style={{ letterSpacing: '0.08em' }}>
          {EMBED_LABEL[kind] ?? kind}
        </div>
        <div className="truncate text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {details.title}
        </div>
        {disparu
          ? <div className="truncate text-[11px] italic text-texte-doux">{EMBED_DISPARU[kind] ?? 'N’est plus disponible'}</div>
          : details.subtitle && <div className="truncate text-[11px] text-texte-doux">{details.subtitle}</div>}
      </div>
      {!disparu && (
        <span className="shrink-0 text-texte-tres-doux">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
      )}
    </Enveloppe>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = diffMs / 60000
    if (diffMins < 1) return 'à l\'instant'
    if (diffMins < 60) return `il y a ${Math.floor(diffMins)} min`
    const diffH = diffMins / 60
    if (diffH < 24) return `il y a ${Math.floor(diffH)} h`
    const diffD = diffH / 24
    if (diffD < 7) return `il y a ${Math.floor(diffD)} j`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
