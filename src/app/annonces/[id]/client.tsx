'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'
import AnnonceContactModal from '@/components/AnnonceContactModal'
import BottomNavBar, { NAV_H } from '@/components/BottomNavBar'
import FeatureButton, { FeatureModal } from '@/components/FeatureButton'
import ImageLightbox from '@/components/ImageLightbox'
import { useSmartBack } from '@/hooks/useSmartBack'
import {
  getPrixAffiche,
  getNextDropDate,
  formatCountdown,
  getProchaineBaisse,
  getPrixTimeline,
  getQuotaSponsoring,
  CATEGORIES_LABELS,
  CATEGORIES_ICONS,
  type Annonce,
} from '@/lib/annonces'
import type { Plan } from '@/lib/capabilities'

interface Props { id: string }

const TYPE_INFO: Record<Annonce['type'], { label: string; emoji: string; color: string; bg: string }> = {
  vente:            { label: 'Vente',             emoji: '🏷️', color: '#3A5BC7', bg: '#EEF3FF' },
  troc:             { label: 'Troc',              emoji: '🔄', color: '#E8622A', bg: '#FFF0EB' },
  don:              { label: 'Don',               emoji: '🎁', color: '#2D5A3D', bg: '#E8F2EB' },
  service:          { label: 'Service',           emoji: '🛠️', color: '#2E7D74', bg: '#E6F2F0' },
  enchere_inversee: { label: 'Enchère inversée',  emoji: '📉', color: '#C0392B', bg: '#FBE9E7' },
}

interface VendeurInfo {
  display_name: string | null
  avatar_url: string | null
  ville: string | null
  note_moyenne: number | null
  notes_count: number
}

interface ConvSummary {
  id: string
  acheteur: { display_name: string | null; avatar_url: string | null } | null
  last_message: { content: string; created_at: string; kind: string } | null
  unread_count: number
  statut: 'open' | 'closed'
  updated_at: string
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: '#2D5A3D', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

export default function AnnoncePageClient({ id }: Props) {
  const router = useRouter()
  const goBack = useSmartBack('/annonces')
  const { user, profile, isAdmin } = useAuth()
  const { openAuthModal } = useAuthModal()
  const plan = (profile?.plan as Plan) ?? 'basic'

  const [annonce, setAnnonce]     = useState<Annonce | null>(null)
  const [vendeur, setVendeur]     = useState<VendeurInfo | null>(null)
  const [loading, setLoading]     = useState(true)
  const [photoIdx, setPhotoIdx]   = useState(0)
  const [editing, setEditing]     = useState(false)
  const [action, setAction]       = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [convs, setConvs]         = useState<ConvSummary[]>([])
  const [showBoostBanner, setShowBoostBanner] = useState(false)
  const [boostModalOpen, setBoostModalOpen]   = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [lightboxOpen, setLightboxOpen]         = useState(false)

  // Détection ?just_created=1 (post-création → propose boost)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('just_created') === '1') {
      setShowBoostBanner(true)
    }
  }, [])

  async function reload() {
    const { data } = await supabase.from('annonces').select('*').eq('id', id).maybeSingle()
    setAnnonce(data as Annonce | null)
    if (data) await loadVendeur(data.user_id)
  }

  async function loadVendeur(userId: string) {
    const [{ data: prof }, { data: stats }] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url, ville').eq('user_id', userId).maybeSingle(),
      supabase.from('vendeur_stats').select('note_moyenne, notes_count').eq('user_id', userId).maybeSingle(),
    ])
    setVendeur({
      display_name: prof?.display_name ?? null,
      avatar_url:   prof?.avatar_url ?? null,
      ville:        (prof as { ville?: string | null })?.ville ?? null,
      note_moyenne: stats?.note_moyenne ? Number(stats.note_moyenne) : null,
      notes_count:  stats?.notes_count ?? 0,
    })
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      await reload().catch(() => {})
      if (mounted) setLoading(false)
    })()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Conversations (owner only)
  useEffect(() => {
    if (!user || !annonce || annonce.user_id !== user.id) return
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch(`/api/annonces/${id}/conversations`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setConvs(data.conversations ?? [])
    })()
  }, [user, annonce, id])

  async function callApi(path: string, method: 'POST' | 'DELETE' = 'POST', body?: object) {
    if (!user) { openAuthModal(`/annonces/${id}`); return null }
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { openAuthModal(`/annonces/${id}`); return null }
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Erreur'); return null }
    return data
  }

  function handleContacter() {
    if (!user) { openAuthModal(`/annonces/${id}`); return }
    setError(null)
    setContactModalOpen(true)
  }

  async function handleSendMessage(message: string) {
    setAction('contact'); setError(null)
    const data = await callApi(`/api/annonces/${id}/conversations`, 'POST', { message })
    setAction(null)
    setContactModalOpen(false)
    if (data?.conversation) router.push(`/annonces/conversations/${data.conversation.id}`)
  }

  async function handlePrendreEnchere() {
    if (!user) { openAuthModal(`/annonces/${id}`); return }
    setAction('enchere'); setError(null)
    const data = await callApi(`/api/annonces/${id}/prendre-enchere`, 'POST', {})
    setAction(null)
    if (data?.conversation_id) router.push(`/annonces/conversations/${data.conversation_id}`)
  }

  async function handleMarquerVendu() {
    if (!confirm('Marquer comme vendu ? Cette action ferme l\'annonce.')) return
    setAction('vendu'); setError(null)
    const ok = await callApi(`/api/annonces/${id}/marquer-vendu`, 'POST', {})
    if (ok) { toast.success('Annonce vendue'); await reload() }
    setAction(null)
  }

  async function handleSponsoriser() {
    setAction('sponsor'); setError(null)
    const ok = await callApi(`/api/annonces/${id}/sponsoriser`, 'POST', {})
    if (ok) { toast.success('En vedette 5 jours'); await reload() }
    setAction(null)
  }

  async function handleSupprimer() {
    if (!confirm('Supprimer définitivement cette annonce ?')) return
    setAction('delete'); setError(null)
    const ok = await callApi(`/api/annonces/${id}`, 'DELETE')
    if (ok) router.push('/annonces')
    else setAction(null)
  }


  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }
  if (!annonce) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', padding: 40, textAlign: 'center', fontFamily: 'var(--font-body), sans-serif' }}>
        <p style={{ color: '#8A7A6A' }}>Annonce introuvable.</p>
        <Link href="/annonces" style={{ color: '#2D5A3D', fontWeight: 700 }}>← Retour aux annonces</Link>
      </div>
    )
  }

  const isOwner   = user?.id === annonce.user_id
  const isActive  = annonce.statut === 'active'
  const isEnchere = annonce.type === 'enchere_inversee'
  const info = TYPE_INFO[annonce.type]
  const photos = annonce.photos
  const quota = getQuotaSponsoring(plan)
  const peutSponsoriser = isOwner && isActive && !annonce.sponsored && quota > 0

  if (editing && (isOwner || isAdmin)) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'var(--font-body), sans-serif', paddingBottom: 80 }}>
        <div style={stickyHeaderStyle}>
          <button onClick={() => setEditing(false)} style={backBtnStyle}>←</button>
          <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0 }}>Modifier l&apos;annonce</p>
        </div>
        <div style={{ padding: 16 }}>
          <div style={cardStyle}>
            <AnnonceForm initial={annonce} bottomOffset={NAV_H} onSuccess={async () => { await reload(); setEditing(false) }} />
          </div>
        </div>
        <BottomNavBar />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', backgroundColor: '#FDFAF5', fontFamily: 'var(--font-body), sans-serif', paddingBottom: isActive && !isOwner ? 144 : 80 }}>

      {/* Bannière post-création */}
      {showBoostBanner && isOwner && (
        <div style={{
          margin: '12px 12px 0',
          padding: '14px 14px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #2D5A3D 0%, #4A7A5A 100%)',
          color: '#fff',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 4px 16px rgba(45,90,61,0.25)',
        }}>
          <span style={{ flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Votre annonce est en ligne !</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.9, }}>
              Voulez-vous la mettre en avant ?
            </p>
          </div>
          <button
            onClick={() => setBoostModalOpen(true)}
            style={{
              padding: '8px 14px', borderRadius: 999,
              backgroundColor: '#fff', color: '#2D5A3D',
              border: 'none', fontSize: 11, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >Mettre en avant</button>
          <button
            onClick={() => setShowBoostBanner(false)}
            aria-label="Fermer"
            style={{
              width: 26, height: 26, borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800,
              flexShrink: 0,
            }}
          >✕</button>
        </div>
      )}

      {boostModalOpen && annonce && (
        <FeatureModal
          contentType="annonce"
          contentId={annonce.id}
          isAdmin={false}
          isOwner={true}
          plan={plan as 'basic' | 'habitants' | 'pro'}
          onClose={() => { setBoostModalOpen(false); setShowBoostBanner(false) }}
        />
      )}

      {/* V3 Floating top actions overlay sur le hero */}
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 }}>
        <button
          onClick={goBack} aria-label="Retour"
          style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1209', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <FeatureButton contentType="annonce" contentId={id} ownerUserId={annonce.user_id ?? null} />}
          {(isOwner || isAdmin) && (
            <button
              onClick={() => setEditing(true)} aria-label="Modifier"
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2D5A3D', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          )}
          <button
            onClick={() => {
              const url = window.location.href
              if (navigator.share) navigator.share({ title: annonce.titre, url }).catch(() => {})
              else { navigator.clipboard.writeText(url).catch(() => {}); toast.success('Lien copié') }
            }}
            aria-label="Partager"
            style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1209', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
        </div>
      </div>

      {/* Photo hero — plus grand, dégradé double */}
      <div style={{ position: 'relative', height: 340, backgroundColor: '#F0EBE3', overflow: 'hidden' }}>
        {photos.length > 0
          ? <img
              src={photos[photoIdx]}
              alt=""
              onClick={() => setLightboxOpen(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
            />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>{CATEGORIES_ICONS[annonce.categorie]}</div>}
        {photos.length > 0 && (
          <ImageLightbox
            src={photos[photoIdx]}
            alt={annonce.titre ?? ''}
            controlled={{ open: lightboxOpen, onClose: () => setLightboxOpen(false) }}
          />
        )}
        {/* pointerEvents:none → laisse le clic atteindre l'image (zoom lightbox) */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 28%, rgba(0,0,0,0.55) 100%)' }} />

        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ backgroundColor: info.color, color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: `0 2px 10px ${info.color}66` }}>{info.label}</span>
          {annonce.sponsored && <span style={{ backgroundColor: '#E8622A', color: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>✦ En vedette</span>}
          {annonce.statut === 'vendu'     && <span style={{ backgroundColor: '#3A5BC7', color: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 10, fontWeight: 800 }}>VENDU</span>}
          {annonce.statut === 'expiree'   && <span style={{ backgroundColor: '#8A7A6A', color: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 10, fontWeight: 800 }}>EXPIRÉE</span>}
          {annonce.statut === 'don_final' && <span style={{ backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 10, fontWeight: 800 }}>DON FINAL</span>}
        </div>

        {isEnchere && isActive && (
          <div style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(26,18,9,0.78)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '7px 11px', textAlign: 'right' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Prochaine baisse</div>
            <CountdownInline />
          </div>
        )}

        {photos.length > 1 && (
          <>
            <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)} style={photoNavBtn('left')}>‹</button>
            <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)} style={photoNavBtn('right')}>›</button>
            <div style={{ position: 'absolute', bottom: 38, left: 16, display: 'flex', gap: 5 }}>
              {photos.map((_, i) => (
                <span key={i} style={{ width: i === photoIdx ? 18 : 5, height: 5, borderRadius: 3, backgroundColor: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width 0.2s' }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sheet crème éditorial */}
      <div style={{ background: '#FDFAF5', borderRadius: '26px 26px 0 0', marginTop: -26, position: 'relative', zIndex: 4, padding: '22px 18px 0', display: 'flex', flexDirection: 'column' }}>

        {/* Méta chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <MetaChip>{CATEGORIES_LABELS[annonce.categorie]}</MetaChip>
          {annonce.ville && <MetaChip icon={<IcoPin />}>{annonce.ville}</MetaChip>}
          {(annonce as { created_at?: string }).created_at && <MetaChip>il y a {timeAgo((annonce as { created_at: string }).created_at)}</MetaChip>}
        </div>

        {/* Titre + prix éditoriaux */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 25, lineHeight: 1.1, color: '#1A1209', letterSpacing: '-0.02em', flex: 1 }}>{annonce.titre}</h1>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, color: info.color, letterSpacing: '-0.01em' }}>{getPrixAffiche(annonce)}</div>
            {isEnchere && annonce.statut === 'active' && (
              <div style={{ fontSize: 10.5, color: '#C0392B', fontWeight: 700, marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <IcoTrend /> −{getProchaineBaisse(annonce)} €/jour
              </div>
            )}
          </div>
        </div>
        {isEnchere && <div style={{ fontSize: 11, color: '#8A7A6A', marginTop: 4 }}>Prix actuel — baisse chaque jour à minuit</div>}

        {/* Timeline prix (enchère active) */}
        {isEnchere && annonce.statut === 'active' && annonce.prix_actuel != null && (
          <div style={{ marginTop: 16, padding: '14px 14px 12px', background: '#fff', borderRadius: 14, border: '1px solid #F0E8DC' }}>
            <div style={LABEL}>Évolution du prix</div>
            <PrixTimelineFull annonce={annonce} />
          </div>
        )}

        {/* Description — texte fluide */}
        {annonce.description && (
          <div style={{ marginTop: 20 }}>
            <div style={LABEL}>La description</div>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: '#3C2C20', fontFamily: BODY_SERIF, whiteSpace: 'pre-wrap' }}>{annonce.description}</p>
            {annonce.remise_main_propre && (
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <SoftBadge icon={<IcoHand />}>Remise en main propre</SoftBadge>
              </div>
            )}
          </div>
        )}

        {error && (
          <p style={{ margin: '16px 0 0', padding: 10, borderRadius: 10, backgroundColor: '#FFEBE6', color: '#C0392B', fontSize: 13, fontWeight: 600 }}>{error}</p>
        )}

        {/* Vendeur — strip inline */}
        {vendeur && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #EDE6DA' }}>
            <div style={LABEL}>Proposé par</div>
            <Link href={`/profil/${annonce.user_id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
              {vendeur.avatar_url
                ? <img src={vendeur.avatar_url} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 50, height: 50, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #4A7A5A, #2D5A3D)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 22, boxShadow: '0 3px 10px rgba(45,90,61,0.25)' }}>{(vendeur.display_name || '?')[0].toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1209', letterSpacing: '-0.01em' }}>{vendeur.display_name ?? 'Vendeur'}</div>
                <div style={{ fontSize: 12, color: '#8A7A6A', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {vendeur.notes_count > 0 && vendeur.note_moyenne != null ? (
                    <><IcoStar /> {vendeur.note_moyenne.toFixed(1)} <span style={{ color: '#A89B8C' }}>· {vendeur.notes_count} avis{vendeur.ville ? ` · ${vendeur.ville}` : ''}</span></>
                  ) : (
                    <span style={{ color: '#A89B8C' }}>Pas encore d&apos;avis{vendeur.ville ? ` · ${vendeur.ville}` : ''}</span>
                  )}
                </div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F0EAE0', color: '#7A6A5A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IcoChev /></div>
            </Link>
          </div>
        )}

        {/* Réassurance */}
        <div style={{ marginTop: 18, padding: '12px 14px', background: '#F4EEE3', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#2D5A3D', flexShrink: 0 }}><IcoShield /></span>
          <div style={{ fontSize: 11.5, color: '#5A4A3A', lineHeight: 1.4 }}>Transaction entre voisins — rencontrez-vous dans un lieu public, payez à la remise.</div>
        </div>

        {/* Conversations entrantes (owner) */}
        {isOwner && convs.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #EDE6DA' }}>
            <div style={LABEL}>Conversations ({convs.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {convs.map(c => (
                <Link key={c.id} href={`/annonces/conversations/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #EDE6DA', textDecoration: 'none', color: 'inherit' }}>
                  <Avatar name={c.acheteur?.display_name || '?'} url={c.acheteur?.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.acheteur?.display_name ?? 'Acheteur'}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.last_message
                        ? (c.last_message.kind === 'system_contact' ? 'Coordonnées partagées' :
                           c.last_message.kind === 'system_closed'  ? 'Vente conclue' :
                           c.last_message.content)
                        : 'Pas de message'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 10, color: '#A89B8C' }}>{timeAgo(c.updated_at)}</span>
                    {c.unread_count > 0 && <span style={{ backgroundColor: '#E53935', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 800, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{c.unread_count}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Mon annonce / modération (owner ou admin) */}
        {(isOwner || isAdmin) && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #EDE6DA' }}>
            <div style={LABEL}>{isOwner ? 'Mon annonce' : 'Modération (admin)'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isOwner && isActive && (
                <ActionButton onClick={handleMarquerVendu} disabled={action === 'vendu'}>
                  {action === 'vendu' ? '…' : 'Marquer comme vendu'}
                </ActionButton>
              )}
              {peutSponsoriser && (
                <ActionButton onClick={handleSponsoriser} disabled={action === 'sponsor'}>
                  {action === 'sponsor' ? '…' : 'Mettre en vedette (5 jours)'}
                </ActionButton>
              )}
              <ActionButton danger onClick={handleSupprimer} disabled={action === 'delete'}>
                {action === 'delete' ? '…' : 'Supprimer'}
              </ActionButton>
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      {/* Bottom bar fixe — acheteur sur annonce active (couleur du type) */}
      {!isOwner && isActive && (
        <div style={{
          position: 'fixed', bottom: NAV_H, left: 0, right: 0,
          padding: '12px 14px',
          backgroundColor: 'rgba(253,250,245,0.96)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid #EDE6DA', display: 'flex', gap: 10, zIndex: 40,
        }}>
          <button
            type="button"
            onClick={handleContacter}
            aria-label="Contacter"
            style={{ width: 54, padding: '13px 0', borderRadius: 14, border: '1.5px solid #E5DDD2', background: '#fff', color: '#2D5A3D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IcoChat />
          </button>
          <button
            onClick={isEnchere ? handlePrendreEnchere : handleContacter}
            disabled={action !== null}
            style={{
              flex: 1, padding: '14px', borderRadius: 14, border: 'none',
              backgroundColor: info.color, color: '#fff',
              fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
              cursor: action ? 'wait' : 'pointer', opacity: action ? 0.7 : 1,
              boxShadow: `0 6px 20px ${info.color}55`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            }}
          >
            <span>
              {isEnchere ? `Acheter à ${getPrixAffiche(annonce)}` : annonce.type === 'don' ? 'Prendre ce don' : annonce.type === 'troc' ? 'Proposer un troc' : annonce.type === 'service' ? 'Contacter' : `Acheter à ${getPrixAffiche(annonce)}`}
            </span>
            {isEnchere && <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 600 }}>avant la prochaine baisse</span>}
          </button>
        </div>
      )}

      <BottomNavBar />

      <AnnonceContactModal
        open={contactModalOpen}
        vendeurNom={vendeur?.display_name ?? 'le vendeur'}
        annonceTitre={annonce.titre}
        loading={action === 'contact'}
        onClose={() => setContactModalOpen(false)}
        onSubmit={handleSendMessage}
      />
    </div>
  )
}

// ───────────── Sub-components ─────────────

function CountdownInline() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = getNextDropDate(now).getTime() - now.getTime()
  return (
    <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: '#FFB23F', marginTop: 1 }}>
      {formatCountdown(ms)}
    </span>
  )
}

// ───────────── Refonte éditoriale — tokens & helpers ─────────────
const SERIF = 'var(--font-display), Georgia, serif'
const BODY_SERIF = 'Georgia, "Times New Roman", serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#8A7A6A',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
}

const SVG_BASE = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IcoPin   = ({ s = 11 }: { s?: number }) => <svg width={s} height={s} {...SVG_BASE}><path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
const IcoTrend = ({ s = 11 }: { s?: number }) => <svg width={s} height={s} {...SVG_BASE}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
const IcoHand  = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} {...SVG_BASE}><path d="M18 11V6a2 2 0 0 0-4 0v0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
const IcoChev  = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} {...SVG_BASE}><polyline points="9 6 15 12 9 18" /></svg>
const IcoChat  = ({ s = 20 }: { s?: number }) => <svg width={s} height={s} {...SVG_BASE}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
const IcoShield = ({ s = 18 }: { s?: number }) => <svg width={s} height={s} {...SVG_BASE}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" /></svg>
const IcoStar  = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="#D4A93C"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" /></svg>

function MetaChip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999, background: '#F0EAE0', fontSize: 11, fontWeight: 600, color: '#7A6A5A' }}>
      {icon}{children}
    </span>
  )
}
function SoftBadge({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999, background: '#F5F1EB', color: '#3C2C20', fontSize: 11.5, fontWeight: 700 }}>
      {icon}{children}
    </span>
  )
}

function PrixTimelineFull({ annonce }: { annonce: Annonce }) {
  const points = getPrixTimeline(annonce, 8)
  if (points.length < 2) return null
  const aujourdHui = points[0]
  const dernier = points[points.length - 1]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 4, padding: '8px 0 4px' }}>
        {points.map((p, i) => {
          const isToday = i === 0
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontSize: 11, fontWeight: isToday ? 900 : 700,
                color: isToday ? '#2D5A3D' : '#8A7A6A',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {p.prix.toFixed(p.prix % 1 === 0 ? 0 : 2)}€
              </span>
              <div style={{
                width: '100%', height: isToday ? 14 : 8,
                borderRadius: 4,
                backgroundColor: isToday ? '#2D5A3D' : `rgba(232, 98, 42, ${0.6 - i * 0.06})`,
              }} />
              <span style={{ fontSize: 9, color: isToday ? '#2D5A3D' : '#A89B8C', fontWeight: isToday ? 800 : 600 }}>
                {i === 0 ? 'Auj.' : `J+${p.jour}`}
              </span>
            </div>
          )
        })}
      </div>
      {annonce.prix_seuil != null && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#C0392B', textAlign: 'center' }}>
          Atteindra le seuil de <b>{annonce.prix_seuil} €</b> au prix de <b>{dernier.prix.toFixed(2)} €</b>
          {aujourdHui.prix > annonce.prix_seuil && ` dans ~${points.length - 1} jour${points.length > 2 ? 's' : ''}`}
        </p>
      )}
    </div>
  )
}

function ActionButton({
  children, onClick, primary, danger, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  const bg = danger ? 'transparent' : primary ? '#2D5A3D' : '#fff'
  const fg = danger ? '#C0392B' : primary ? '#fff' : '#2C1810'
  const border = danger ? '1.5px solid #FCC' : primary ? 'none' : '1.5px solid #E5DDD2'
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: '12px 16px', borderRadius: 12, border,
      backgroundColor: bg, color: fg,
      fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
      cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  )
}

// ───────────── Styles partagés ─────────────
const stickyHeaderStyle: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 20,
  backgroundColor: 'rgba(242,235,224,0.92)',
  backdropFilter: 'blur(10px)',
  padding: '12px 16px',
  display: 'flex', alignItems: 'center', gap: 10,
}

const backBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#2D5A3D', fontSize: 18, flexShrink: 0,
  boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 16,
  padding: '16px 18px',
  boxShadow: '0 1px 8px rgba(44,28,16,0.08)',
}

function photoNavBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 10,
    top: '45%', transform: 'translateY(-50%)',
    width: 34, height: 34, borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.6)',
    border: 'none', color: '#2C1810',
    cursor: 'pointer', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
