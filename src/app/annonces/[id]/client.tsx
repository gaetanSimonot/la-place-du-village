'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnoncePhotosCarousel from '@/components/AnnoncePhotosCarousel'
import AnnonceForm from '@/components/AnnonceForm'
import {
  getPrixAffiche,
  getJoursAvantSeuil,
  getQuotaSponsoring,
  CATEGORIES_LABELS,
  type Annonce,
} from '@/lib/annonces'
import type { Plan } from '@/lib/capabilities'

interface Props { id: string }

const TYPE_LABELS: Record<Annonce['type'], string> = {
  vente: 'Vente',
  troc: 'Troc',
  don: 'Don',
  enchere_inversee: 'Enchère inversée',
}

export default function AnnoncePageClient({ id }: Props) {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const plan = (profile?.plan as Plan) ?? 'basic'

  const [annonce, setAnnonce]   = useState<Annonce | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(false)
  const [action, setAction]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

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

  async function handleInteret() {
    setAction('interet'); setError(null); setSuccess(null)
    const ok = await callApi(`/api/annonces/${id}/interet`, 'POST', {})
    if (ok) setSuccess('Intérêt envoyé au posteur.')
    setAction(null)
  }

  async function handlePrendreEnchere() {
    if (!confirm('Confirmer la prise de cette enchère au prix actuel ?')) return
    setAction('enchere'); setError(null); setSuccess(null)
    const ok = await callApi(`/api/annonces/${id}/prendre-enchere`, 'POST', {})
    if (ok) { setSuccess('Enchère prise ! Le posteur a été notifié.'); await reload() }
    setAction(null)
  }

  async function handleMarquerVendu() {
    if (!confirm('Marquer comme vendu ? Cette action ferme l\'annonce.')) return
    setAction('vendu'); setError(null)
    const ok = await callApi(`/api/annonces/${id}/marquer-vendu`, 'POST', {})
    if (ok) { await reload() }
    setAction(null)
  }

  async function handleSponsoriser() {
    setAction('sponsor'); setError(null); setSuccess(null)
    const ok = await callApi(`/api/annonces/${id}/sponsoriser`, 'POST', {})
    if (ok) { setSuccess('Annonce mise en vedette pendant 5 jours !'); await reload() }
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
    return <div style={{ padding: 40, textAlign: 'center', color: '#8A7A6A' }}>Chargement…</div>
  }
  if (!annonce) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8A7A6A' }}>Annonce introuvable.</div>
  }

  const isOwner   = user?.id === annonce.user_id
  const isActive  = annonce.statut === 'active'
  const isEnchere = annonce.type === 'enchere_inversee'
  const joursAvantSeuil = getJoursAvantSeuil(annonce)
  const quota = getQuotaSponsoring(plan)
  const peutSponsoriser = isOwner && isActive && !annonce.sponsored && quota > 0

  if (editing && isOwner) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF6', padding: 16, paddingBottom: 100 }}>
        <button
          onClick={() => setEditing(false)}
          style={{ background: 'none', border: 'none', fontSize: 14, color: '#2D5A3D', fontWeight: 700, marginBottom: 12, cursor: 'pointer' }}
        >
          ← Annuler l'édition
        </button>
        <AnnonceForm initial={annonce} onSuccess={async () => { await reload(); setEditing(false) }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF6', paddingBottom: 120 }}>
      {/* Back */}
      <div style={{ padding: '12px 16px' }}>
        <Link href="/annonces" style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 700, textDecoration: 'none' }}>
          ← Retour aux annonces
        </Link>
      </div>

      {/* Photos */}
      <AnnoncePhotosCarousel photos={annonce.photos} alt={annonce.titre} />

      {/* Corps */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge color="#3A5BC7" bg="#EEF3FF">{TYPE_LABELS[annonce.type]}</Badge>
          <Badge color="#8A7A6A" bg="#F5F1EB">{CATEGORIES_LABELS[annonce.categorie]}</Badge>
          {annonce.sponsored && <Badge color="#fff" bg="#E8622A">✦ En vedette</Badge>}
          {annonce.statut === 'vendu'     && <Badge color="#fff" bg="#3A5BC7">Vendu</Badge>}
          {annonce.statut === 'expiree'   && <Badge color="#fff" bg="#8A7A6A">Expirée</Badge>}
          {annonce.statut === 'don_final' && <Badge color="#fff" bg="#2D5A3D">Don final</Badge>}
        </div>

        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#1C1917', lineHeight: 1.2 }}>
          {annonce.titre}
        </h1>

        <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#2D5A3D', fontVariantNumeric: 'tabular-nums' }}>
          {getPrixAffiche(annonce)}
        </p>

        {isEnchere && isActive && joursAvantSeuil !== null && joursAvantSeuil > 0 && (
          <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A' }}>
            Le prix baisse de {annonce.taux_baisse_pct}% par jour.
            {annonce.prix_seuil != null && ` Atteindra le seuil de ${annonce.prix_seuil} € dans environ ${joursAvantSeuil} jour${joursAvantSeuil > 1 ? 's' : ''}.`}
          </p>
        )}

        {annonce.ville && (
          <p style={{ margin: 0, fontSize: 14, color: '#8A7A6A' }}>📍 {annonce.ville}</p>
        )}

        {annonce.description && (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#3C2C20', whiteSpace: 'pre-wrap' }}>
            {annonce.description}
          </p>
        )}

        {/* Contact (visible si annonce active et coordonnées fournies) */}
        {isActive && (annonce.contact_tel || annonce.contact_email) && (
          <div style={{ padding: 14, borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: '#3C2C20' }}>Contact</p>
            {annonce.contact_tel && (
              <a href={`tel:${annonce.contact_tel}`} style={{ display: 'block', fontSize: 15, color: '#2D5A3D', fontWeight: 700, textDecoration: 'none' }}>
                📞 {annonce.contact_tel}
              </a>
            )}
            {annonce.contact_email && (
              <a href={`mailto:${annonce.contact_email}`} style={{ display: 'block', fontSize: 15, color: '#2D5A3D', fontWeight: 700, textDecoration: 'none' }}>
                ✉ {annonce.contact_email}
              </a>
            )}
          </div>
        )}

        {error && <p style={{ margin: 0, padding: 10, borderRadius: 8, backgroundColor: '#FFEBE6', color: '#C0392B', fontSize: 13, fontWeight: 600 }}>{error}</p>}
        {success && <p style={{ margin: 0, padding: 10, borderRadius: 8, backgroundColor: '#E8F2EB', color: '#2D5A3D', fontSize: 13, fontWeight: 600 }}>{success}</p>}

        {/* Actions selon rôle */}
        {!isOwner && isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isEnchere ? (
              <ActionButton primary disabled={action === 'enchere'} onClick={handlePrendreEnchere}>
                {action === 'enchere' ? '...' : `Prendre à ${getPrixAffiche(annonce)}`}
              </ActionButton>
            ) : (
              <ActionButton primary disabled={action === 'interet'} onClick={handleInteret}>
                {action === 'interet' ? '...' : '⭐ Ça m\'intéresse'}
              </ActionButton>
            )}
          </div>
        )}

        {isOwner && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isActive && (
              <>
                <ActionButton onClick={() => setEditing(true)}>✏️ Modifier</ActionButton>
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
              {action === 'delete' ? '...' : '🗑 Supprimer'}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 800,
      color,
      backgroundColor: bg,
      padding: '3px 10px',
      borderRadius: 999,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
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
  const bg = danger ? '#FFEBE6' : primary ? '#2D5A3D' : '#fff'
  const fg = danger ? '#C0392B' : primary ? '#fff'   : '#1C1917'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '14px 18px',
        borderRadius: 12,
        border: primary || danger ? 'none' : '1px solid #E5DDD2',
        backgroundColor: bg,
        color: fg,
        fontSize: 15,
        fontWeight: 800,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}
