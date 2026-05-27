'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAdminSession } from '@/hooks/useAdminSession'
import { useFriendships } from '@/hooks/useFriendships'
import { PLANS_INFO, PLAN_ORDER, type Plan } from '@/lib/capabilities'
import type { AppNotification, NotifType } from '@/lib/types'
import { toast } from 'sonner'

interface Props {
  notifications: AppNotification[]
  loading: boolean
  loaded: boolean
  onOpen: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onDelete?: (id: string) => void
  onOpenProducer?: (id: string) => void
  onBack?: () => void
}

/* ─── Type → visual config V3 (palette + SVG icon) ────────────────────── */

type IconRenderer = (size?: number) => React.ReactNode

interface NotifVisual {
  bg:    string
  color: string
  icon:  IconRenderer
  label: (n: AppNotification) => string
}

function makeIcon(path: React.ReactNode): IconRenderer {
  return function IconRender(size = 20) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
    )
  }
}
const I = makeIcon

const ICONS = {
  star:     I(<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>),
  chat:     I(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>),
  leaf:     I(<><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></>),
  cart:     I(<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>),
  gift:     I(<><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>),
  calendar: I(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  hammer:   I(<><path d="M14 2L7 9l3 3 7-7-3-3z"/><path d="M9 11l-7 7v3h3l7-7"/></>),
  clock:    I(<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>),
  check:    I(<polyline points="20 6 9 17 4 12"/>),
  cross:    I(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>),
  clipboard:I(<><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></>),
  phone:    I(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>),
  bellOff:  I(<><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M18 14.32C18 11 18 8 12 8c-6 0-6 3-6 6.32 0 7 8 5 8 5z"/></>),
  trash:    I(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>),
  eye:      I(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
  bell:     I(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>),
  car:      I(<><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></>),
}

// Fallback safe : si un nouveau type est inséré côté serveur avant que ce
// fichier soit mis à jour, on évite le crash et on affiche un visuel neutre.
const DEFAULT_NOTIF_VISUAL: NotifVisual = {
  bg: '#F0EBE3', color: '#7A6A5A', icon: ICONS.bell,
  label: n => n.actor_name ?? 'Notification',
}

const NOTIF_VISUAL: Record<NotifType, NotifVisual> = {
  disponibilite:          { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.leaf,     label: n => `${n.actor_name ?? 'Un producteur'} a un produit disponible` },
  nouveau_produit:        { bg: '#EAF3E6', color: '#5B8A4A', icon: ICONS.cart,     label: n => `${n.actor_name ?? 'Un producteur'} a ajouté un nouveau produit` },
  suivi_producteur:       { bg: '#E8F2EB', color: '#4A7C59', icon: ICONS.leaf,     label: n => `${n.actor_name ?? 'Quelqu\'un'} suit votre fiche producteur` },
  commentaire:            { bg: '#F0EBE3', color: '#7A6A5A', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Quelqu\'un'} a commenté votre fiche` },
  claim_pending:          { bg: '#FFF0E5', color: '#C84B2F', icon: ICONS.clipboard,label: n => `Nouvelle demande${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  claim_approved:         { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.check,    label: n => `Revendication approuvée${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  claim_rejected:         { bg: '#F0EBE3', color: '#A0654E', icon: ICONS.cross,    label: n => `Revendication refusée${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  promo_used:             { bg: '#FFF0E5', color: '#E8622A', icon: ICONS.gift,     label: n => `${n.actor_name ?? 'Un client'} a utilisé votre promo` },
  annonce_interet_recu:   { bg: '#FFF0E5', color: '#C84B2F', icon: ICONS.star,     label: n => `${n.actor_name ?? 'Quelqu\'un'} s'intéresse à votre annonce` },
  annonce_enchere_prise:  { bg: '#E8EEF7', color: '#3A5BC7', icon: ICONS.hammer,   label: n => `${n.actor_name ?? 'Quelqu\'un'} a pris votre enchère` },
  annonce_expire_bientot: { bg: '#F0EBE3', color: '#7A6A5A', icon: ICONS.clock,    label: () => 'Votre annonce expire dans 2 jours' },
  annonce_devient_don:    { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.gift,     label: () => 'Votre enchère a atteint le seuil — devenue un don' },
  annonce_message:        { bg: '#E8EEF7', color: '#3A5BC7', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Quelqu\'un'} vous a envoyé un message` },
  annonce_contact_partage:{ bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.phone,    label: () => 'Le vendeur a partagé ses coordonnées' },
  annonce_vente_close:    { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.check,    label: n => `${n.actor_name ?? 'L\'autre partie'} a conclu la vente` },
  annonce_note_recue:     { bg: '#FFF7DC', color: '#A8770F', icon: ICONS.star,     label: n => `${n.actor_name ?? 'Un acheteur'} vous a noté` },
  event_published:        { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.calendar, label: n => `Événement publié${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  support_message:        { bg: '#E8EEF7', color: '#3A5BC7', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Quelqu\'un'} — message support` },
  journal_publie:         { bg: '#1A1209', color: '#E8C58A', icon: ICONS.clipboard,label: () => 'Nouveau Journal du Village publié' },
  article_like:           { bg: '#FFF0E5', color: '#C84B2F', icon: ICONS.star,     label: n => `${n.actor_name ?? 'Un lecteur'} a aimé ton article` },
  article_comment:        { bg: '#E8EEF7', color: '#3A5BC7', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Un lecteur'} a commenté ton article` },
  covoit_candidat:        { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.car,      label: n => `${n.actor_name ?? 'Un voyageur'} candidate à ton trajet` },
  covoit_message:         { bg: '#E8EEF7', color: '#3A5BC7', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Un utilisateur'} — message covoit` },
  covoit_validee:         { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.check,    label: n => `Ta place est validée${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  covoit_refusee:         { bg: '#FFF0E5', color: '#C84B2F', icon: ICONS.cross,    label: n => `Candidature refusée${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  covoit_closed:          { bg: '#F0EBE3', color: '#7A6A5A', icon: ICONS.clock,    label: n => `Conversation covoit fermée${n.actor_name ? ` : ${n.actor_name}` : ''}` },
  covoit_note_recue:      { bg: '#FFF7DC', color: '#A8770F', icon: ICONS.star,     label: n => `${n.actor_name ?? 'Un passager'} t'a noté sur ton trajet` },
  covoit_rate_invitation: { bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.star,     label: n => `Trajet effectué${n.actor_name ? ` avec ${n.actor_name}` : ''} — note le conducteur` },
  feedback_new:           { bg: '#FFF0E5', color: '#C84B2F', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Un utilisateur'} a signalé un événement` },
  friend_request_received:{ bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.star,     label: n => `${n.actor_name ?? 'Quelqu\'un'} t'a envoyé une demande d'ami` },
  friend_request_accepted:{ bg: '#E8F2EB', color: '#2D5A3D', icon: ICONS.check,    label: n => `${n.actor_name ?? 'Quelqu\'un'} a accepté ta demande d'ami` },
  friend_message:         { bg: '#E8EEF7', color: '#3A5BC7', icon: ICONS.chat,     label: n => `${n.actor_name ?? 'Un ami'} t'a envoyé un message` },
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function bucketByDay(notifs: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const start = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() }
  const today = start(new Date())
  const yesterday = today - 86400000
  const buckets: Record<'today' | 'yesterday' | 'earlier', AppNotification[]> = { today: [], yesterday: [], earlier: [] }
  notifs.forEach(n => {
    const t = start(new Date(n.created_at))
    if (t === today)       buckets.today.push(n)
    else if (t === yesterday) buckets.yesterday.push(n)
    else                   buckets.earlier.push(n)
  })
  const out: { label: string; items: AppNotification[] }[] = []
  if (buckets.today.length)     out.push({ label: 'AUJOURD\'HUI', items: buckets.today })
  if (buckets.yesterday.length) out.push({ label: 'HIER',         items: buckets.yesterday })
  if (buckets.earlier.length)   out.push({ label: 'PLUS TÔT',     items: buckets.earlier })
  return out
}

interface AdminCounts {
  total: number
  byPlan: Record<Plan, number>
  withEtab: number
  pendingClaims: number
}

interface PromoUseHistory {
  id: string
  used_at: string
  title: string
  image_url: string | null
  etablissement: { nom: string; commune: string | null } | null
}

type UserFilter = 'all' | 'annonces' | 'producteurs' | 'promos' | 'events'
type AdminFilter = 'all' | 'unread' | 'demandes' | 'annonces' | 'events' | 'support' | 'boost'

export default function NotificationsView({ notifications, loading, loaded, onOpen, onMarkRead, onMarkAllRead, onDelete, onOpenProducer, onBack }: Props) {
  const { friendships, accept: acceptFriendship, cancel: cancelFriendship } = useFriendships()
  const [busyFriendIds, setBusyFriendIds] = useState<Set<string>>(new Set())

  // Status d'un friendship par id (source de vérité = hook useFriendships
  // qui se refresh après chaque accept/cancel). Permet d'afficher "✓ Acceptée"
  // au lieu des boutons Accepter/Refuser une fois la demande traitée, même
  // après un refresh de la page. Si la friendship n'est pas trouvée en
  // mémoire, on retombe sur 'pending' (= afficher les boutons par défaut).
  function friendshipStatus(friendshipId: string): 'pending' | 'accepted' | 'unknown' {
    const f = friendships.find(x => x.id === friendshipId)
    if (!f) return 'unknown'
    return f.status === 'accepted' ? 'accepted' : 'pending'
  }

  async function handleFriendAccept(friendshipId: string, notifId: string) {
    if (busyFriendIds.has(friendshipId)) return
    setBusyFriendIds(prev => new Set(prev).add(friendshipId))
    try {
      await acceptFriendship(friendshipId)
      // On garde la notif visible mais on la marque lue. Le bouton bascule
      // automatiquement en "✓ Acceptée" grâce à friendshipStatus() qui voit
      // le nouveau status après le refresh interne du hook useFriendships.
      onMarkRead(notifId)
    } catch (e) {
      console.error('[notif accept]', e)
      toast.error('Erreur en acceptant la demande. Réessaie.')
    } finally {
      setBusyFriendIds(prev => { const next = new Set(prev); next.delete(friendshipId); return next })
    }
  }

  async function handleFriendRefuse(friendshipId: string, notifId: string) {
    if (busyFriendIds.has(friendshipId)) return
    setBusyFriendIds(prev => new Set(prev).add(friendshipId))
    try {
      await cancelFriendship(friendshipId)
      // Refus = la friendship est supprimée côté DB → friendshipStatus
      // retournera 'unknown' au prochain render → on affiche un état figé.
      // On supprime la notif côté UI pour ne pas garder un témoin orphelin.
      if (onDelete) onDelete(notifId)
      else          onMarkRead(notifId)
    } catch (e) {
      console.error('[notif refuse]', e)
      toast.error('Erreur en refusant la demande. Réessaie.')
    } finally {
      setBusyFriendIds(prev => { const next = new Set(prev); next.delete(friendshipId); return next })
    }
  }
  const router = useRouter()
  const isAdmin = useAdminSession()
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null)
  const [promoHistory, setPromoHistory] = useState<PromoUseHistory[]>([])
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('all')
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [actionModal, setActionModal] = useState<AppNotification | null>(null)

  useEffect(() => { onOpen() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mini dashboard admin
  useEffect(() => {
    if (!isAdmin) { setAdminCounts(null); return }
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const [membresRes, claimsRes] = await Promise.all([
        fetch('/api/admin/membres', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/commerce-requests', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (cancelled) return
      const membresJson = membresRes.ok ? await membresRes.json() : { membres: [] }
      const claimsJson  = claimsRes.ok  ? await claimsRes.json()  : { demandes: [] }
      const membres = (membresJson.membres ?? []) as { plan: Plan; etablissements: unknown[] }[]
      const byPlan: Record<Plan, number> = { basic: 0, habitants: 0, pro: 0 }
      let withEtab = 0
      membres.forEach(m => {
        if (m.plan in byPlan) byPlan[m.plan]++
        if ((m.etablissements ?? []).length > 0) withEtab++
      })
      setAdminCounts({
        total: membres.length,
        byPlan,
        withEtab,
        pendingClaims: (claimsJson.demandes ?? []).length,
      })
    })()
    return () => { cancelled = true }
  }, [isAdmin])

  // Historique promos utilisées par le user
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const r = await fetch('/api/profile/promotions-used', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!r.ok || cancelled) return
      const d = await r.json()
      setPromoHistory(d.uses ?? [])
    })()
    return () => { cancelled = true }
  }, [])

  const unreadCount = notifications.filter(n => !n.lu).length

  /** Routing par type — identique à V2, logique préservée. */
  function handleClick(n: AppNotification) {
    if (!n.lu) onMarkRead(n.id)

    if (n.type === 'claim_pending' || n.target_type === 'claim') {
      router.push('/admin?section=demandes')
      return
    }
    if ((n.type === 'claim_approved' || n.type === 'claim_rejected') && n.target_id) {
      router.push(`/etablissement/${n.target_id}`)
      return
    }
    if (n.target_type === 'conversation' && n.target_id) {
      // covoit_* utilise le même target_type 'conversation' mais pointe vers
      // covoit_conversations, pas annonces_conversations
      if (n.type.startsWith('covoit_')) {
        router.push(`/covoiturage/conversations/${n.target_id}`)
      } else {
        router.push(`/annonces/conversations/${n.target_id}`)
      }
      return
    }
    if (n.target_type === 'support_conversation' && n.target_id) {
      router.push(isAdmin ? `/admin/support/${n.target_id}` : `/support/${n.target_id}`)
      return
    }
    if (n.target_type === 'annonce' && n.target_id) {
      router.push(`/annonces/${n.target_id}`)
      return
    }
    if (n.target_type === 'event' && n.target_id) {
      router.push(`/evenement/${n.target_id}`)
      return
    }
    if (n.target_type === 'producer' && n.target_id) {
      onOpenProducer?.(n.target_id)
      return
    }
    if (n.target_type === 'article' && n.target_id) {
      router.push(`/journal/articles/${n.target_id}/view`)
      return
    }
    if (n.target_type === 'journal') {
      router.push('/journal')
      return
    }
    if (n.target_type === 'friendship') {
      // friend_request_received → /people (la bannière "Demandes reçues" en haut affiche les pending)
      // friend_request_accepted → /people aussi (filtre "Mes amis" disponible)
      router.push('/people')
      return
    }
    if (n.target_type === 'conversation_unified' && n.target_id) {
      // friend_message → /conversations/[id]
      router.push(`/conversations/${n.target_id}`)
      return
    }
  }

  // Filtres user (non-admin) par catégorie
  const filteredUser = useMemo(() => {
    if (userFilter === 'all') return notifications
    if (userFilter === 'annonces')    return notifications.filter(n => n.type.startsWith('annonce_'))
    if (userFilter === 'producteurs') return notifications.filter(n => n.type === 'disponibilite' || n.type === 'nouveau_produit' || n.type === 'suivi_producteur' || n.type === 'commentaire')
    if (userFilter === 'promos')      return notifications.filter(n => n.type === 'promo_used')
    if (userFilter === 'events')      return notifications.filter(n => n.type === 'event_published')
    return notifications
  }, [notifications, userFilter])

  const filteredAdmin = useMemo(() => {
    if (adminFilter === 'all')      return notifications
    if (adminFilter === 'unread')   return notifications.filter(n => !n.lu)
    if (adminFilter === 'demandes') return notifications.filter(n => n.type === 'claim_pending' || n.type === 'claim_approved' || n.type === 'claim_rejected')
    if (adminFilter === 'annonces') return notifications.filter(n => n.type.startsWith('annonce_'))
    if (adminFilter === 'events')   return notifications.filter(n => n.type === 'event_published' || n.type === 'disponibilite' || n.type === 'nouveau_produit' || n.type === 'suivi_producteur' || n.type === 'commentaire')
    if (adminFilter === 'support')  return notifications.filter(n => n.type === 'support_message')
    if (adminFilter === 'boost')    return notifications.filter(n => n.type === 'promo_used' || n.actor_name?.includes('Boost') || n.actor_name?.includes('boost'))
    return notifications
  }, [notifications, adminFilter])

  const visibleNotifs = isAdmin ? filteredAdmin : filteredUser
  const buckets = bucketByDay(visibleNotifs)

  return (
    <div className="min-h-full bg-creme pb-14 font-inter text-texte">
      <style>{`.pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; } .pdv-hscroll::-webkit-scrollbar { display: none; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Top bar V3 */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
        <button
          onClick={() => onBack ? onBack() : router.push('/')}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-px">
          <div className="font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Notifications
          </div>
          {unreadCount > 0 && (
            <div className="text-[11px] font-semibold text-primary">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </div>
          )}
        </div>
        {unreadCount > 0 ? (
          <button
            onClick={onMarkAllRead}
            className="shrink-0 bg-transparent px-1 py-2 text-[12px] font-bold text-primary"
          >
            Tout lu
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0" aria-hidden />
        )}
      </div>

      {/* Mini dashboard admin */}
      {isAdmin && adminCounts && (
        <div className="px-4 pt-3.5">
          <div
            className="rounded-2xl border bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
            style={{ borderColor: '#F0EAE0' }}
          >
            <div className="mb-3 flex items-center justify-between text-[11px]">
              <span className="font-extrabold uppercase tracking-[0.1em] text-texte-doux">Tableau de bord</span>
              <span className="text-texte-doux">{adminCounts.total} membres</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PLAN_ORDER.map(p => {
                const info = PLANS_INFO[p]
                return (
                  <div
                    key={p}
                    className="rounded-[10px] py-2.5 text-center"
                    style={{ backgroundColor: info.bgColor }}
                  >
                    <p className="m-0 mb-0.5 font-mono text-[20px] font-extrabold leading-none" style={{ color: info.color }}>
                      {adminCounts.byPlan[p]}
                    </p>
                    <p className="m-0 text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: info.color }}>
                      {info.label}
                    </p>
                  </div>
                )
              })}
            </div>
            {(adminCounts.withEtab > 0 || adminCounts.pendingClaims > 0) && (
              <div className="mt-3 flex gap-3 border-t border-bord/40 pt-2.5">
                <div className="flex flex-1 items-center gap-1.5">
                  <span className="text-primary">{ICONS.bell(14)}</span>
                  <div>
                    <p className="m-0 text-[13px] font-extrabold leading-none text-texte">{adminCounts.withEtab}</p>
                    <p className="m-0 text-[9px] text-texte-doux">avec établissement</p>
                  </div>
                </div>
                {adminCounts.pendingClaims > 0 && (
                  <button
                    onClick={() => router.push('/admin?section=demandes')}
                    className="flex flex-1 items-center gap-1.5 rounded-[10px] border-none bg-[#FFF0E5] px-2.5 py-1.5"
                  >
                    <span className="text-accent">{ICONS.clipboard(14)}</span>
                    <div className="text-left">
                      <p className="m-0 text-[13px] font-extrabold leading-none text-accent">{adminCounts.pendingClaims}</p>
                      <p className="m-0 text-[9px] text-accent">demandes en attente</p>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter chips */}
      {isAdmin ? (
        notifications.length > 0 && (
          <div
            className="pdv-hscroll flex gap-1.5 overflow-x-auto px-4 pt-3.5"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {([
              { id: 'all',      label: `Tout (${notifications.length})` },
              { id: 'unread',   label: `Non lues (${unreadCount})` },
              { id: 'demandes', label: 'Demandes' },
              { id: 'annonces', label: 'Annonces' },
              { id: 'events',   label: 'Events' },
              { id: 'support',  label: 'Support' },
              { id: 'boost',    label: 'Boost' },
            ] as const).map(f => {
              const active = adminFilter === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setAdminFilter(f.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-bold ${
                    active ? 'border-primary bg-primary-light text-primary' : 'border-bord bg-white text-texte-doux'
                  }`}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {f.label}
                </button>
              )
            })}
            <div className="w-1 shrink-0" aria-hidden />
          </div>
        )
      ) : (
        notifications.length > 0 && (
          <div
            className="pdv-hscroll flex gap-1.5 overflow-x-auto px-4 pt-3.5"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {([
              { id: 'all',         label: 'Toutes' },
              { id: 'annonces',    label: 'Annonces' },
              { id: 'producteurs', label: 'Producteurs' },
              { id: 'promos',      label: 'Bons plans' },
              { id: 'events',      label: 'Événements' },
            ] as const).map(f => {
              const active = userFilter === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setUserFilter(f.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-3 py-1.5 text-[12px] font-bold ${
                    active ? 'border-primary bg-primary-light text-primary' : 'border-bord bg-white text-texte-doux'
                  }`}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {f.label}
                </button>
              )
            })}
            <div className="w-1 shrink-0" aria-hidden />
          </div>
        )
      )}

      {/* Content */}
      <div className="mt-2">
        {loading && !loaded ? (
          <div className="flex justify-center px-4 py-14">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" />
          </div>
        ) : visibleNotifs.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cremeDeep text-texte-doux"
            >
              {ICONS.bell(28)}
            </div>
            <p className="m-0 text-[14px] font-bold text-texte">
              {notifications.length === 0 ? 'Aucune notification' : 'Aucun résultat'}
            </p>
            <p className="mx-auto mt-1 max-w-[280px] text-[12px] text-texte-doux">
              {notifications.length === 0
                ? 'Tu seras notifié quand tes producteurs favoris ont du nouveau.'
                : 'Aucune notification dans cette catégorie.'}
            </p>
          </div>
        ) : (
          <div className="bg-white">
            {buckets.map(bucket => (
              <section key={bucket.label}>
                <div className="px-4 pb-2 pt-[18px] text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
                  {bucket.label}
                </div>
                {bucket.items.map(n => {
                  const cfg = NOTIF_VISUAL[n.type] ?? DEFAULT_NOTIF_VISUAL
                  const isUnread = !n.lu
                  // Actions inline pour les demandes d'ami reçues. Le `status`
                  // vient de useFriendships → la notif passe automatiquement
                  // en "✓ Acceptée" après accept, même au refresh page.
                  const friendActions = (n.type === 'friend_request_received' && n.target_id) ? {
                    busy:   busyFriendIds.has(n.target_id),
                    status: friendshipStatus(n.target_id),
                    onAccept: () => handleFriendAccept(n.target_id!, n.id),
                    onRefuse: () => handleFriendRefuse(n.target_id!, n.id),
                  } : undefined
                  return (
                    <NotifRow
                      key={n.id}
                      bg={cfg.bg}
                      color={cfg.color}
                      icon={cfg.icon}
                      label={cfg.label(n)}
                      when={relativeDate(n.created_at)}
                      unread={isUnread}
                      onClick={() => handleClick(n)}
                      onMenu={() => setActionModal(n)}
                      onDelete={onDelete ? () => onDelete(n.id) : undefined}
                      friendActions={friendActions}
                    />
                  )
                })}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Historique promos utilisées — collapsible */}
      {promoHistory.length > 0 && (
        <div className="px-4 pt-5">
          <button
            onClick={() => setShowAllHistory(s => !s)}
            className="flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
            style={{ borderColor: '#F0EAE0' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-accent">{ICONS.gift(16)}</span>
              <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-accent">
                Mes promos utilisées ({promoHistory.length})
              </span>
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              className="text-texte-doux"
              style={{ transform: showAllHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showAllHistory && (
            <div
              className="mt-2 rounded-2xl border bg-white px-3 py-1"
              style={{ borderColor: '#F0EAE0' }}
            >
              {promoHistory.map((h, i) => (
                <div
                  key={h.id}
                  className={`flex items-center gap-2.5 py-2.5 ${i < promoHistory.length - 1 ? 'border-b' : ''}`}
                  style={{ borderColor: '#F0EAE0' }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#FFF0E5] text-accent">
                    {h.image_url
                      ? <img src={h.image_url} alt="" className="h-full w-full object-cover" />
                      : ICONS.gift(16)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[12px] font-bold text-texte">{h.title}</p>
                    {h.etablissement && (
                      <p className="m-0 mt-px text-[10px] text-texte-doux">
                        {h.etablissement.nom}{h.etablissement.commune ? ` · ${h.etablissement.commune}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-texte-tres-doux">{relativeDate(h.used_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modale actions */}
      {actionModal && (
        <NotifActionsModal
          notif={actionModal}
          onClose={() => setActionModal(null)}
          onMarkRead={() => { onMarkRead(actionModal.id); setActionModal(null) }}
          onDelete={() => {
            if (onDelete) onDelete(actionModal.id)
            else onMarkRead(actionModal.id)
            setActionModal(null)
          }}
        />
      )}
    </div>
  )
}

/* ─── NotifRow V3 ────────────────────────────────────────────────────── */

function NotifRow({
  bg, color, icon, label, when, unread, onClick, onMenu, onDelete, friendActions,
}: {
  bg:     string
  color:  string
  icon:   IconRenderer
  label:  string
  when:   string
  unread: boolean
  onClick:() => void
  onMenu: () => void
  onDelete?: () => void
  friendActions?: { busy: boolean; status: 'pending' | 'accepted' | 'unknown'; onAccept: () => void; onRefuse: () => void }
}) {
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startX = useRef<number | null>(null)
  const swipedRef = useRef(false)
  const [swipeX, setSwipeX] = useState(0)

  const REVEAL = 84  // largeur du bouton "Supprimer" révélé

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    swipedRef.current = false
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || !onDelete) return
    const dx = e.touches[0].clientX - startX.current
    if (dx < -8) {
      swipedRef.current = true
      if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    }
    // Clamp entre -REVEAL et +20 (petit overshoot pour rebond visuel)
    const x = Math.max(-REVEAL, Math.min(20, dx))
    setSwipeX(x)
  }
  const handleTouchEnd = () => {
    if (startX.current == null) return
    // Snap : si > moitié, on révèle ; sinon on referme
    if (swipeX < -REVEAL / 2) setSwipeX(-REVEAL)
    else setSwipeX(0)
    startX.current = null
  }

  const handleClickRow = () => {
    // Si on vient de swipe, on ne déclenche pas le click (ou on close)
    if (swipedRef.current || swipeX !== 0) {
      setSwipeX(0)
      swipedRef.current = false
      return
    }
    onClick()
  }

  return (
    <div
      className="relative overflow-hidden border-b"
      style={{ borderColor: '#F0EAE0' }}
    >
      {/* Bouton Supprimer caché derrière */}
      {onDelete && (
        <button
          type="button"
          aria-label="Supprimer la notification"
          onClick={() => { onDelete(); setSwipeX(0) }}
          style={{
            position: 'absolute',
            top: 0, right: 0, bottom: 0,
            width: REVEAL,
            background: '#C84B2F',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 800,
            zIndex: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={handleClickRow}
        onContextMenu={e => { e.preventDefault(); onMenu() }}
        onPointerDown={() => { lpTimer.current = setTimeout(onMenu, 500) }}
        onPointerUp={() => { if (lpTimer.current) clearTimeout(lpTimer.current) }}
        onPointerCancel={() => { if (lpTimer.current) clearTimeout(lpTimer.current) }}
        onTouchStart={onDelete ? handleTouchStart : undefined}
        onTouchMove={onDelete ? handleTouchMove : undefined}
        onTouchEnd={onDelete ? handleTouchEnd : undefined}
        onKeyDown={e => { if (e.key === 'Enter') onClick() }}
        className="relative flex cursor-pointer items-start gap-3 px-4 py-3.5"
        style={{
          backgroundColor: unread ? '#FFFCF6' : '#FDFAF5',
          transform: `translateX(${swipeX}px)`,
          transition: startX.current == null ? 'transform 180ms ease-out' : 'none',
          zIndex: 1,
        }}
      >
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: bg, color }}
        >
          {icon(20)}
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <div
            className="text-[13px] leading-[1.4] text-texte"
            style={{ fontWeight: unread ? 600 : 500 }}
          >
            {label}
          </div>
          <div className="mt-0.5 text-[11px] text-texte-doux">{when}</div>
          {friendActions && (
            friendActions.status === 'accepted' ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#E8F2EB] px-3 py-1.5 text-[11px] font-bold text-[#2D5A3D]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Acceptée
              </div>
            ) : (
              <div className="mt-2 flex gap-1.5" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={friendActions.onAccept}
                  disabled={friendActions.busy}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {friendActions.busy ? '…' : 'Accepter'}
                </button>
                <button
                  type="button"
                  onClick={friendActions.onRefuse}
                  disabled={friendActions.busy}
                  className="inline-flex items-center gap-1 rounded-full border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte-doux disabled:opacity-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Refuser
                </button>
              </div>
            )
          )}
        </div>
        {unread && (
          <span
            className="absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary"
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}

/* ─── Modale actions (long-press / context menu) ─────────────────────── */

function NotifActionsModal({
  notif, onClose, onMarkRead, onDelete,
}: {
  notif:      AppNotification
  onClose:    () => void
  onMarkRead: () => void
  onDelete:   () => void
}) {
  const cfg = NOTIF_VISUAL[notif.type] ?? DEFAULT_NOTIF_VISUAL

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-4 pb-7 pt-3.5"
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}
      >
        <div className="mx-auto mb-3.5 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        {/* Preview de la notif */}
        <div className="mb-2 flex items-start gap-3 border-b px-1 pb-4 pt-1" style={{ borderColor: '#F0EAE0' }}>
          <div
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: cfg.bg, color: cfg.color }}
          >
            {cfg.icon(20)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-[1.4] text-texte">{cfg.label(notif)}</div>
            <div className="mt-0.5 text-[11px] text-texte-doux">{relativeDate(notif.created_at)}</div>
          </div>
        </div>

        {/* Actions */}
        {!notif.lu && (
          <ActionRow
            icon={ICONS.eye}
            label="Marquer comme lue"
            color="#1A1209"
            onClick={onMarkRead}
          />
        )}
        <ActionRow
          icon={ICONS.bellOff}
          label="Désactiver ce type de notif"
          color="#1A1209"
          onClick={onClose /* TODO: route vers réglages quand câblé */}
        />
        <ActionRow
          icon={ICONS.trash}
          label="Supprimer la notification"
          color="#B53A22"
          onClick={onDelete}
        />

        <button
          onClick={onClose}
          className="mt-2 w-full rounded-2xl border-none bg-cremeDeep py-3 text-[14px] font-bold text-texte-doux"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

function ActionRow({
  icon, label, color, onClick,
}: {
  icon:   IconRenderer
  label:  string
  color:  string
  onClick:() => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3.5 bg-transparent px-1 py-3.5 text-[14px] font-semibold"
      style={{ color }}
    >
      <span>{icon(20)}</span>
      <span>{label}</span>
    </button>
  )
}
