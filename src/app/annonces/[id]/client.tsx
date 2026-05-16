'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'
import BottomNavBar from '@/components/BottomNavBar'
import FeatureButton, { FeatureModal } from '@/components/FeatureButton'
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
  const [toast, setToast]         = useState<string | null>(null)
  const [convs, setConvs]         = useState<ConvSummary[]>([])
  const [showBoostBanner, setShowBoostBanner] = useState(false)
  const [boostModalOpen, setBoostModalOpen]   = useState(false)

  // Détection ?just_created=1 (post-création → propose boost)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('just_created') === '1') {
      setShowBoostBanner(true)
    }
  }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2200) }

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

  async function handleContacter() {
    if (!user) { openAuthModal(`/annonces/${id}`); return }
    setAction('contact'); setError(null)
    const data = await callApi(`/api/annonces/${id}/conversations`, 'POST', { message: 'Bonjour, votre annonce m\'intéresse.' })
    setAction(null)
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
    if (ok) { showToast('Annonce vendue'); await reload() }
    setAction(null)
  }

  async function handleSponsoriser() {
    setAction('sponsor'); setError(null)
    const ok = await callApi(`/api/annonces/${id}/sponsoriser`, 'POST', {})
    if (ok) { showToast('En vedette 5 jours !'); await reload() }
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
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', padding: 40, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
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

  if (editing && isOwner) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
        <div style={stickyHeaderStyle}>
          <button onClick={() => setEditing(false)} style={backBtnStyle}>←</button>
          <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0 }}>Modifier l&apos;annonce</p>
        </div>
        <div style={{ padding: 16 }}>
          <div style={cardStyle}>
            <AnnonceForm initial={annonce} onSuccess={async () => { await reload(); setEditing(false) }} />
          </div>
        </div>
        <BottomNavBar />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: isActive && !isOwner ? 144 : 80 }}>
      {toast && <Toast msg={toast} />}

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
          <span style={{ fontSize: 26, flexShrink: 0 }}>🎉</span>
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
          >🚀 Booster</button>
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

      {/* Header */}
      <div style={stickyHeaderStyle}>
        <button onClick={() => router.back()} style={backBtnStyle}>←</button>
        <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{annonce.titre}</p>
        {isAdmin && <FeatureButton contentType="annonce" contentId={id} ownerUserId={annonce.user_id ?? null} />}
        {isOwner && isActive && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', border: '1.5px solid #2D5A3D', borderRadius: 10, padding: '5px 12px', backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0 }}>✏️</button>
        )}
      </div>

      {/* Photo hero */}
      <div style={{ position: 'relative', height: 280, backgroundColor: '#F0EBE3', overflow: 'hidden' }}>
        {photos.length > 0
          ? <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>{CATEGORIES_ICONS[annonce.categorie]}</div>}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.5) 100%)' }} />

        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ backgroundColor: info.color, color: '#fff', borderRadius: 999, padding: '4px 11px', fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{info.emoji} {info.label}</span>
          {annonce.sponsored && <span style={{ backgroundColor: '#E8622A', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>✦ En vedette</span>}
          {annonce.statut === 'vendu'     && <span style={{ backgroundColor: '#3A5BC7', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800 }}>VENDU</span>}
          {annonce.statut === 'expiree'   && <span style={{ backgroundColor: '#8A7A6A', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800 }}>EXPIRÉE</span>}
          {annonce.statut === 'don_final' && <span style={{ backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800 }}>DON FINAL</span>}
        </div>

        {isEnchere && isActive && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            padding: '8px 12px', borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prochaine baisse</span>
            <CountdownInline />
          </div>
        )}

        {photos.length > 1 && (
          <>
            <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)} style={photoNavBtn('left')}>‹</button>
            <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)} style={photoNavBtn('right')}>›</button>
            <div style={{ position: 'absolute', bottom: 18, left: 16, display: 'flex', gap: 5 }}>
              {photos.map((_, i) => (
                <span key={i} style={{ width: i === photoIdx ? 18 : 5, height: 5, borderRadius: 3, backgroundColor: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width 0.2s' }} />
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Card prix */}
        <div style={cardStyle}>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 900, color: '#2C1810', lineHeight: 1.2 }}>{annonce.titre}</h1>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#8A7A6A' }}>
            {CATEGORIES_ICONS[annonce.categorie]} {CATEGORIES_LABELS[annonce.categorie]}
            {annonce.ville && <> · 📍 {annonce.ville}</>}
          </p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: info.color, fontVariantNumeric: 'tabular-nums' }}>
              {getPrixAffiche(annonce)}
            </p>
            {isEnchere && annonce.statut === 'active' && (
              <span style={{ fontSize: 12, color: '#C0392B', fontWeight: 700 }}>
                ↘ −{getProchaineBaisse(annonce)} € / jour
              </span>
            )}
          </div>
          {isEnchere && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8A7A6A' }}>Prix actuel — baisse chaque jour à minuit</p>}
        </div>

        {/* Évolution prix (enchère active) */}
        {isEnchere && annonce.statut === 'active' && annonce.prix_actuel != null && (
          <div style={cardStyle}>
            <p style={cardLabel}>Évolution du prix</p>
            <PrixTimelineFull annonce={annonce} />
          </div>
        )}

        {/* Vendeur */}
        {vendeur && (
          <div style={cardStyle}>
            <p style={cardLabel}>Vendeur</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={vendeur.display_name || '?'} url={vendeur.avatar_url} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#2C1810' }}>{vendeur.display_name ?? 'Vendeur'}</p>
                {vendeur.notes_count > 0 && vendeur.note_moyenne != null ? (
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8A7A6A' }}>
                    ⭐ {vendeur.note_moyenne.toFixed(1)} <span style={{ color: '#A89B8C' }}>({vendeur.notes_count} avis)</span>
                  </p>
                ) : (
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#A89B8C' }}>Pas encore d&apos;avis</p>
                )}
              </div>
            </div>

            {/* Badges annonce */}
            {annonce.remise_main_propre && (
              <div style={{ marginTop: 12 }}>
                <Badge>🤝 Remise en main propre</Badge>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {annonce.description && (
          <div style={cardStyle}>
            <p style={cardLabel}>À propos</p>
            <p style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{annonce.description}</p>
          </div>
        )}

        {error && (
          <p style={{ margin: 0, padding: 10, borderRadius: 10, backgroundColor: '#FFEBE6', color: '#C0392B', fontSize: 13, fontWeight: 600 }}>{error}</p>
        )}

        {/* Conversations entrantes (owner) */}
        {isOwner && convs.length > 0 && (
          <div style={cardStyle}>
            <p style={cardLabel}>Conversations ({convs.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {convs.map(c => (
                <Link key={c.id} href={`/annonces/conversations/${c.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0', borderBottom: '1px solid #F0E8DC',
                  textDecoration: 'none', color: 'inherit',
                }}>
                  <Avatar name={c.acheteur?.display_name || '?'} url={c.acheteur?.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.acheteur?.display_name ?? 'Acheteur'}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.last_message
                        ? (c.last_message.kind === 'system_contact' ? '📞 coordonnées partagées' :
                           c.last_message.kind === 'system_closed'  ? '✓ vente conclue' :
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

        {/* Actions owner */}
        {isOwner && isActive && (
          <div style={cardStyle}>
            <p style={cardLabel}>Mon annonce</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionButton onClick={handleMarquerVendu} disabled={action === 'vendu'}>
                {action === 'vendu' ? '...' : '✓ Marquer comme vendu'}
              </ActionButton>
              {peutSponsoriser && (
                <ActionButton onClick={handleSponsoriser} disabled={action === 'sponsor'}>
                  {action === 'sponsor' ? '...' : `✦ Mettre en vedette (5 jours)`}
                </ActionButton>
              )}
              <ActionButton danger onClick={handleSupprimer} disabled={action === 'delete'}>
                {action === 'delete' ? '...' : '🗑 Supprimer'}
              </ActionButton>
            </div>
          </div>
        )}

      </div>

      {/* Bottom bar fixe — acheteur sur annonce active */}
      {!isOwner && isActive && (
        <div style={{
          position: 'fixed',
          bottom: 64, left: 0, right: 0,
          padding: '10px 12px',
          backgroundColor: 'rgba(253,250,246,0.95)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid #E5DDD2',
          display: 'flex', gap: 8,
          zIndex: 40,
        }}>
          <button
            onClick={() => router.push(`/annonces/${id}#contact`)}
            style={{
              padding: '12px 16px', borderRadius: 12,
              border: '1.5px solid #2D5A3D',
              backgroundColor: '#fff', color: '#2D5A3D',
              fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClickCapture={e => { e.preventDefault(); handleContacter() }}
          >💬 Contacter</button>
          <button
            onClick={isEnchere ? handlePrendreEnchere : handleContacter}
            disabled={action !== null}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
              backgroundColor: info.color, color: '#fff',
              fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
              cursor: action ? 'wait' : 'pointer', opacity: action ? 0.7 : 1,
              boxShadow: `0 4px 14px ${info.color}40`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            }}
          >
            <span>
              {isEnchere ? `🔨 Acheter à ${getPrixAffiche(annonce)}` : `${info.emoji} ${annonce.type === 'don' ? 'Prendre ce don' : annonce.type === 'troc' ? 'Proposer un troc' : `Acheter à ${getPrixAffiche(annonce)}`}`}
            </span>
            {isEnchere && <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 600 }}>avant la prochaine baisse</span>}
          </button>
        </div>
      )}

      <BottomNavBar />
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
    <span style={{ fontSize: 16, fontWeight: 800, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>
      {formatCountdown(ms)}
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '6px 10px', borderRadius: 999,
      backgroundColor: '#F5F1EB', color: '#3C2C20',
      fontSize: 11, fontWeight: 700,
    }}>{children}</span>
  )
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
      backgroundColor: '#2C1810', color: '#fff', borderRadius: 14,
      padding: '10px 20px', fontSize: 13, fontWeight: 600,
      boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
    }}>{msg}</div>
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

const cardLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#8A7A6A',
  margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em',
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
