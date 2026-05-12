'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'
import BottomNavBar from '@/components/BottomNavBar'
import {
  getPrixAffiche,
  getJoursAvantSeuil,
  getQuotaSponsoring,
  CATEGORIES_LABELS,
  CATEGORIES_ICONS,
  type Annonce,
} from '@/lib/annonces'
import type { Plan } from '@/lib/capabilities'

interface Props { id: string }

const TYPE_LABELS: Record<Annonce['type'], string> = {
  vente: 'Vente',
  troc: 'Troc',
  don: 'Don',
  enchere_inversee: 'Enchère',
}

const TYPE_COLORS: Record<Annonce['type'], string> = {
  vente:            '#3A5BC7',
  troc:             '#E8622A',
  don:              '#2D5A3D',
  enchere_inversee: '#C0392B',
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

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
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
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const plan = (profile?.plan as Plan) ?? 'basic'

  const [annonce, setAnnonce]     = useState<Annonce | null>(null)
  const [loading, setLoading]     = useState(true)
  const [photoIdx, setPhotoIdx]   = useState(0)
  const [editing, setEditing]     = useState(false)
  const [action, setAction]       = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [toast, setToast]         = useState<string | null>(null)
  const [convs, setConvs]         = useState<ConvSummary[]>([])
  const [convsLoading, setConvsLoading] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function reload() {
    const { data } = await supabase.from('annonces').select('*').eq('id', id).maybeSingle()
    setAnnonce(data as Annonce | null)
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

  // Si on est owner, charger les conversations entrantes
  useEffect(() => {
    if (!user || !annonce) return
    if (annonce.user_id !== user.id) return
    setConvsLoading(true)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setConvsLoading(false); return }
      const res = await fetch(`/api/annonces/${id}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setConvs(data.conversations ?? [])
      setConvsLoading(false)
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

  // Contacter le vendeur → crée/récupère conv → redirect chat
  async function handleContacter() {
    if (!user) { openAuthModal(`/annonces/${id}`); return }
    setAction('contact'); setError(null)
    const initial = prompt('Votre message au vendeur :', 'Bonjour, votre annonce m\'intéresse.')
    if (initial === null) { setAction(null); return }
    const data = await callApi(`/api/annonces/${id}/conversations`, 'POST', { message: initial.trim() })
    setAction(null)
    if (data?.conversation) router.push(`/annonces/conversations/${data.conversation.id}`)
  }

  async function handlePrendreEnchere() {
    if (!user) { openAuthModal(`/annonces/${id}`); return }
    setAction('enchere'); setError(null)
    const data = await callApi(`/api/annonces/${id}/prendre-enchere`, 'POST', {})
    setAction(null)
    // Redirect direct vers le chat avec le vendeur pour finaliser
    if (data?.conversation_id) {
      router.push(`/annonces/conversations/${data.conversation_id}`)
    }
  }

  async function handleMarquerVendu() {
    if (!confirm('Marquer comme vendu ? Cette action ferme l\'annonce.')) return
    setAction('vendu'); setError(null)
    const ok = await callApi(`/api/annonces/${id}/marquer-vendu`, 'POST', {})
    if (ok) { showToast('Annonce marquée vendue'); await reload() }
    setAction(null)
  }

  async function handleSponsoriser() {
    setAction('sponsor'); setError(null)
    const ok = await callApi(`/api/annonces/${id}/sponsoriser`, 'POST', {})
    if (ok) { showToast('Annonce en vedette pendant 5 jours !'); await reload() }
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
  const joursAvantSeuil = getJoursAvantSeuil(annonce)
  const quota = getQuotaSponsoring(plan)
  const peutSponsoriser = isOwner && isActive && !annonce.sponsored && quota > 0
  const typeColor = TYPE_COLORS[annonce.type]
  const photos = annonce.photos

  // Mode édition
  if (editing && isOwner) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.95)', backdropFilter: 'blur(10px)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setEditing(false)} style={backBtnStyle}>←</button>
          <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0 }}>Modifier l&apos;annonce</p>
        </div>
        <div style={{ padding: 16 }}>
          <AnnonceForm initial={annonce} onSuccess={async () => { await reload(); setEditing(false) }} />
        </div>
        <BottomNavBar />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, backgroundColor: '#2C1810', color: '#fff', borderRadius: 14, padding: '10px 20px', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,0.28)' }}>{toast}</div>
      )}

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.back()} style={backBtnStyle}>←</button>
        <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{annonce.titre}</p>
        {isOwner && isActive && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', border: '1.5px solid #2D5A3D', borderRadius: 10, padding: '5px 12px', backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0 }}>✏️</button>
        )}
      </div>

      {/* Photo / hero */}
      <div style={{ position: 'relative', height: 280, backgroundColor: '#F0EBE3', overflow: 'hidden' }}>
        {photos.length > 0
          ? <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>{CATEGORIES_ICONS[annonce.categorie]}</div>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 18%, rgba(0,0,0,0.15) 48%, rgba(0,0,0,0.78) 100%)' }} />

        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ backgroundColor: typeColor, color: '#fff', borderRadius: 999, padding: '4px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>{TYPE_LABELS[annonce.type]}</span>
          {annonce.sponsored && <span style={{ backgroundColor: '#E8622A', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>✦ En vedette</span>}
          {annonce.statut === 'vendu'     && <span style={{ backgroundColor: '#3A5BC7', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>Vendu</span>}
          {annonce.statut === 'expiree'   && <span style={{ backgroundColor: '#8A7A6A', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>Expirée</span>}
          {annonce.statut === 'don_final' && <span style={{ backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>Don final</span>}
        </div>

        {photos.length > 1 && <>
          <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)} style={{ position: 'absolute', left: 10, top: '45%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 18 }}>‹</button>
          <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)} style={{ position: 'absolute', right: 10, top: '45%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 18 }}>›</button>
          <div style={{ position: 'absolute', bottom: 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            {photos.map((_, i) => (
              <span key={i} style={{ width: i === photoIdx ? 18 : 5, height: 5, borderRadius: 3, backgroundColor: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width 0.2s' }} />
            ))}
          </div>
        </>}

        <div style={{ position: 'absolute', bottom: 18, left: 16, right: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 4px', lineHeight: 1.2 }}>{annonce.titre}</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
            {CATEGORIES_ICONS[annonce.categorie]} {CATEGORIES_LABELS[annonce.categorie]}
            {annonce.ville && <> · 📍 {annonce.ville}</>}
          </p>
        </div>
      </div>

      {/* Card prix flottante */}
      <div style={{ position: 'relative', zIndex: 2, marginTop: -38, marginLeft: 12, marginRight: 12, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0 2px 14px rgba(44,28,16,0.1)', padding: '16px 20px' }}>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: typeColor, fontVariantNumeric: 'tabular-nums' }}>
          {getPrixAffiche(annonce)}
        </p>
        {isEnchere && isActive && joursAvantSeuil !== null && joursAvantSeuil > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8A7A6A' }}>
            ↓ {annonce.taux_baisse_pct}%/jour
            {annonce.prix_seuil != null && ` · seuil ${annonce.prix_seuil}€ dans ~${joursAvantSeuil}j`}
          </p>
        )}
      </div>

      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Description */}
        {annonce.description && (
          <div style={CARD}>
            <h3 style={H3}>Description</h3>
            <p style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{annonce.description}</p>
          </div>
        )}

        {/* Erreur inline */}
        {error && (
          <p style={{ margin: 0, padding: 10, borderRadius: 8, backgroundColor: '#FFEBE6', color: '#C0392B', fontSize: 13, fontWeight: 600 }}>{error}</p>
        )}

        {/* Actions acheteur */}
        {!isOwner && isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isEnchere ? (
              <ActionButton primary disabled={action === 'enchere'} onClick={handlePrendreEnchere}>
                {action === 'enchere' ? '...' : `🔨 Prendre à ${getPrixAffiche(annonce)}`}
              </ActionButton>
            ) : (
              <ActionButton primary disabled={action === 'contact'} onClick={handleContacter}>
                {action === 'contact' ? '...' : '💬 Contacter le vendeur'}
              </ActionButton>
            )}
          </div>
        )}

        {/* Conversations entrantes (owner) */}
        {isOwner && (
          <div style={CARD}>
            <h3 style={H3}>Conversations {convs.length > 0 && `(${convs.length})`}</h3>
            {convsLoading ? (
              <p style={{ fontSize: 13, color: '#8A7A6A', margin: 0 }}>Chargement…</p>
            ) : convs.length === 0 ? (
              <p style={{ fontSize: 13, color: '#8A7A6A', margin: 0 }}>Aucun acheteur ne vous a encore contacté.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {convs.map(c => (
                  <Link
                    key={c.id}
                    href={`/annonces/conversations/${c.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 4px', borderBottom: '1px solid #F0E8DC',
                      textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <Avatar name={c.acheteur?.display_name || '?'} url={c.acheteur?.avatar_url} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.acheteur?.display_name ?? 'Acheteur'}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.last_message
                          ? (c.last_message.kind === 'system_contact' ? '📞 coordonnées partagées' :
                             c.last_message.kind === 'system_closed' ? '✓ vente conclue' :
                             c.last_message.content)
                          : 'Pas de message'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 10, color: '#A89B8C' }}>{timeAgo(c.updated_at)}</span>
                      {c.unread_count > 0 && (
                        <span style={{ backgroundColor: '#E53935', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 800, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions vendeur */}
        {isOwner && (
          <div style={CARD}>
            <h3 style={H3}>Mon annonce</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isActive && (
                <>
                  <ActionButton onClick={handleMarquerVendu} disabled={action === 'vendu'}>
                    {action === 'vendu' ? '...' : '✓ Marquer comme vendu'}
                  </ActionButton>
                  {peutSponsoriser && (
                    <ActionButton onClick={handleSponsoriser} disabled={action === 'sponsor'}>
                      {action === 'sponsor' ? '...' : `✦ Mettre en vedette (5 jours)`}
                    </ActionButton>
                  )}
                </>
              )}
              <ActionButton danger onClick={handleSupprimer} disabled={action === 'delete'}>
                {action === 'delete' ? '...' : '🗑 Supprimer cette annonce'}
              </ActionButton>
            </div>
          </div>
        )}
      </div>

      <BottomNavBar />
    </div>
  )
}

// ─────────── Styles partagés ───────────
const CARD: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 16,
  padding: '16px 18px',
  boxShadow: '0 1px 8px rgba(44,28,16,0.08)',
}

const H3: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: '#8A7A6A',
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const backBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.8)',
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#2D5A3D', fontSize: 18, flexShrink: 0,
  boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '13px 18px',
        borderRadius: 12,
        border,
        backgroundColor: bg,
        color: fg,
        fontSize: 14,
        fontWeight: 800,
        fontFamily: 'inherit',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}
