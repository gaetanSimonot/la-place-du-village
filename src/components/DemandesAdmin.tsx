'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface EtabSummary {
  id: string
  nom: string
  commune: string | null
  type: string | null
  photos: string[] | null
  user_id: string | null
}

interface RequesterSummary {
  user_id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
  plan: string | null
}

interface Demande {
  id: string
  nom: string
  type_commerce: string | null
  type: string | null
  commune: string | null
  contact: string | null
  message: string | null
  adresse: string | null
  lat: number | null
  lng: number | null
  place_id_google: string | null
  description: string | null
  site_web: string | null
  horaires: string | null
  photos: string[] | null
  created_at: string
  etablissement_id: string | null
  user_id: string | null
  etablissement: EtabSummary | null
  requester: RequesterSummary | null
}

interface ProducerDemande {
  id: string
  nom: string
  description: string | null
  contact: string | null
  site_web: string | null
  horaires: string | null
  adresse: string | null
  commune: string | null
  lat: number | null
  lng: number | null
  produit_categories: string[] | null
  photos: string[] | null
  message: string | null
  traite: boolean
  created_at: string
  user_id: string | null
  requester: RequesterSummary | null
}

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function DemandesAdmin() {
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [producerDemandes, setProducerDemandes] = useState<ProducerDemande[]>([])
  const [loading, setLoading]   = useState(true)
  const [working, setWorking]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const token = await getToken()
    const [commerceRes, producerRes] = await Promise.all([
      fetch('/api/admin/commerce-requests', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/admin/producer-requests', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (commerceRes.ok) {
      const d = await commerceRes.json()
      setDemandes(d.demandes ?? [])
    }
    if (producerRes.ok) {
      const d = await producerRes.json()
      setProducerDemandes(d.demandes ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'approve_create') => {
    setWorking(id); setError(null)
    const token = await getToken()
    const res = await fetch('/api/admin/commerce-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? `Erreur ${res.status}`)
      setWorking(null)
      return
    }
    const data = await res.json().catch(() => ({}))
    setDemandes(prev => prev.filter(d => d.id !== id))
    setWorking(null)
    // approve_create : redirige vers la fiche créée pour permettre l'édition
    if (action === 'approve_create' && data.etablissement_id) {
      window.location.href = `/etablissement/${data.etablissement_id}`
    }
  }

  const handleProducerAction = async (id: string, action: 'approve_create' | 'reject') => {
    setWorking(id); setError(null)
    const token = await getToken()
    const res = await fetch('/api/admin/producer-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? `Erreur ${res.status}`)
      setWorking(null)
      return
    }
    const data = await res.json().catch(() => ({}))
    setProducerDemandes(prev => prev.filter(d => d.id !== id))
    setWorking(null)
    if (action === 'approve_create' && data.producer_id) {
      window.location.href = `/producteur/${data.producer_id}`
    }
  }

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#9A8A7A', fontFamily: 'var(--font-body), sans-serif' }}>
      Chargement des demandes…
    </div>
  )

  if (!demandes.length && !producerDemandes.length) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#9A8A7A', fontFamily: 'var(--font-body), sans-serif' }}>
      <p style={{ fontSize: 40, margin: '0 0 12px' }}>📭</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#7A6A5A', margin: 0 }}>Aucune demande en attente</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-body), sans-serif', paddingBottom: 40 }}>
      {error && (
        <div style={{ margin: '12px 16px', padding: '10px 14px', borderRadius: 10, backgroundColor: '#FEF2F2', color: '#C4622D', fontSize: 12 }}>
          ⚠ {error}
        </div>
      )}

      {demandes.map(d => {
        const isClaim         = d.type_commerce === 'claim' && !!d.etablissement_id
        const isAdminContact  = d.type_commerce === 'admin_contact'
        // Un admin_contact avec etab_id+user_id = revendication exceptionnelle
        // après quota atteint -> bouton Accepter = assigne la fiche au user
        const isExceptional   = isAdminContact && !!d.etablissement_id && !!d.user_id
        const isWorking       = working === d.id
        const canApprove      = (isClaim || isExceptional)
          ? (d.etablissement && (!d.etablissement.user_id || d.etablissement.user_id === d.user_id))
          : true

        const badgeConf = isExceptional
          ? { label: '⭐ Demande exceptionnelle', bg: '#FFF0E5', color: '#C4622D' }
          : isAdminContact
            ? { label: '📩 Message', bg: '#FFF7E5', color: '#8B6914' }
            : isClaim
              ? { label: '🏪 Revendication', bg: '#FEF0F5', color: '#EC407A' }
              : { label: '➕ Nouveau commerce', bg: '#EEF3FF', color: '#3A5BC7' }

        return (
          <div key={d.id} style={{ borderBottom: '1px solid #F0EBE0', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Header — Type de demande */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999,
                backgroundColor: badgeConf.bg, color: badgeConf.color,
              }}>
                {badgeConf.label}
              </span>
              <span style={{ fontSize: 11, color: '#B0A898', marginLeft: 'auto' }}>
                {fmtDate(d.created_at)}
              </span>
            </div>

            {/* Pour les messages admin (sans etab) : afficher juste le sujet */}
            {isAdminContact && !isExceptional && (
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', margin: 0 }}>{d.nom}</p>
              </div>
            )}

            {/* Etablissement concerné (si claim ou demande exceptionnelle) */}
            {(isClaim || isExceptional) && d.etablissement && (
              <a href={`/etablissement/${d.etablissement.id}`} target="_blank" rel="noreferrer"
                 style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#F8F4ED', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {d.etablissement.photos?.[0]
                    ? <img src={d.etablissement.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 16 }}>🏪</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.etablissement.nom}</p>
                  <p style={{ fontSize: 11, color: '#7A6A5A', margin: 0 }}>
                    {d.etablissement.commune ?? '—'} {d.etablissement.user_id && d.etablissement.user_id !== d.user_id ? '· déjà revendiqué ⚠' : ''}
                  </p>
                </div>
                <span style={{ color: '#C8B8A8', fontSize: 16 }}>↗</span>
              </a>
            )}

            {/* Pour les non-claims et non-messages : afficher le détail */}
            {!isClaim && !isAdminContact && (
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', margin: 0 }}>{d.nom}</p>
                {(d.type || d.type_commerce || d.commune) && (
                  <p style={{ fontSize: 12, color: '#7A6A5A', margin: '2px 0 0' }}>
                    {[d.type ?? d.type_commerce, d.commune].filter(Boolean).join(' · ')}
                  </p>
                )}
                {d.adresse && (
                  <p style={{ fontSize: 11, color: '#7A6A5A', margin: '4px 0 0' }}>📍 {d.adresse}</p>
                )}
                {d.description && (
                  <p style={{ fontSize: 12, color: '#3C2C20', margin: '6px 0 0', lineHeight: 1.4, }}>{d.description}</p>
                )}
                {d.site_web && (
                  <p style={{ fontSize: 11, margin: '4px 0 0' }}><a href={d.site_web} target="_blank" rel="noreferrer" style={{ color: '#3A5BC7' }}>{d.site_web}</a></p>
                )}
                {d.horaires && (
                  <p style={{ fontSize: 11, color: '#7A6A5A', margin: '2px 0 0' }}>🕐 {d.horaires}</p>
                )}
                {d.photos && d.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {d.photos.map((p, i) => (
                      <img key={i} src={p} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Requester */}
            {d.requester && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {d.requester.avatar_url
                  ? <img src={d.requester.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                      {(d.requester.display_name ?? d.requester.email ?? '?')[0].toUpperCase()}
                    </div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', margin: 0 }}>
                    {d.requester.display_name ?? '—'}
                    {d.requester.plan && d.requester.plan !== 'basic' && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999,
                        backgroundColor: d.requester.plan === 'pro' ? '#EEF3FF' : '#E3F1E7',
                        color: d.requester.plan === 'pro' ? '#3A5BC7' : '#4A8B5C',
                      }}>{d.requester.plan === 'pro' ? 'Partenaire' : 'Habitants'}</span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: '#7A6A5A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.requester.email ?? '—'}
                  </p>
                </div>
              </div>
            )}

            {/* Contact / message */}
            {(d.contact || d.message) && (
              <div style={{ backgroundColor: '#FBF7F0', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#3C2C20', lineHeight: 1.5 }}>
                {d.contact && <p style={{ margin: 0 }}><strong style={{ color: '#7A6A5A' }}>Contact:</strong> {d.contact}</p>}
                {d.message && <p style={{ margin: d.contact ? '4px 0 0' : 0 }}>{d.message}</p>}
              </div>
            )}

            {/* Actions */}
            {isAdminContact && !isExceptional ? (
              <button
                onClick={() => handleAction(d.id, 'approve')}
                disabled={isWorking}
                style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', backgroundColor: '#8B6914', color: '#fff', fontSize: 13, fontWeight: 700, cursor: isWorking ? 'default' : 'pointer', opacity: isWorking ? 0.6 : 1 }}
              >
                {isWorking ? '…' : '✓ Marquer traité'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Nouvelle demande structurée → bouton "Créer la fiche" */}
                {!isClaim && !isExceptional && d.type && d.lat != null && d.lng != null ? (
                  <button
                    onClick={() => handleAction(d.id, 'approve_create')}
                    disabled={isWorking}
                    style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 13, fontWeight: 800, cursor: isWorking ? 'default' : 'pointer', opacity: isWorking ? 0.6 : 1 }}
                  >
                    {isWorking ? '…' : '✓ Créer la fiche'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(d.id, 'approve')}
                    disabled={isWorking || !canApprove}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', backgroundColor: canApprove ? '#2D5A3D' : '#D0C8C0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: isWorking ? 'default' : (canApprove ? 'pointer' : 'not-allowed'), opacity: isWorking ? 0.6 : 1 }}
                  >
                    {isWorking ? '…' : (isExceptional ? '✓ Accepter la demande' : '✓ Valider')}
                  </button>
                )}
                <button
                  onClick={() => handleAction(d.id, 'reject')}
                  disabled={isWorking}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #E8D0C8', backgroundColor: '#fff', color: '#C4622D', fontSize: 13, fontWeight: 700, cursor: isWorking ? 'default' : 'pointer', opacity: isWorking ? 0.6 : 1 }}
                >
                  ✕ Refuser
                </button>
              </div>
            )}

          </div>
        )
      })}

      {/* === SECTION PRODUCTEURS === */}
      {producerDemandes.length > 0 && (
        <>
          <div style={{ margin: '24px 16px 8px', padding: '6px 12px', backgroundColor: '#E8F2EB', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>🌱</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#2D5A3D', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Producteurs ({producerDemandes.length})</span>
          </div>
          {producerDemandes.map(d => {
            const isWorking = working === d.id
            return (
              <div key={d.id} style={{ borderBottom: '1px solid #F0EBE0', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, backgroundColor: '#E8F2EB', color: '#2D5A3D' }}>
                    🌱 Producteur
                  </span>
                  <span style={{ fontSize: 11, color: '#B0A898', marginLeft: 'auto' }}>{fmtDate(d.created_at)}</span>
                </div>

                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', margin: 0 }}>{d.nom}</p>
                  {(d.produit_categories && d.produit_categories.length > 0) && (
                    <p style={{ fontSize: 11, color: '#7A6A5A', margin: '3px 0 0' }}>{d.produit_categories.join(' · ')}</p>
                  )}
                  {d.adresse && <p style={{ fontSize: 11, color: '#7A6A5A', margin: '4px 0 0' }}>📍 {d.adresse}</p>}
                  {d.description && <p style={{ fontSize: 12, color: '#3C2C20', margin: '6px 0 0', lineHeight: 1.4, }}>{d.description}</p>}
                  {d.contact && <p style={{ fontSize: 11, color: '#7A6A5A', margin: '4px 0 0' }}>📞 {d.contact}</p>}
                  {d.site_web && <p style={{ fontSize: 11, margin: '4px 0 0' }}><a href={d.site_web} target="_blank" rel="noreferrer" style={{ color: '#3A5BC7' }}>{d.site_web}</a></p>}
                  {d.horaires && <p style={{ fontSize: 11, color: '#7A6A5A', margin: '2px 0 0' }}>🕐 {d.horaires}</p>}
                  {d.photos && d.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {d.photos.map((p, i) => (
                        <img key={i} src={p} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                      ))}
                    </div>
                  )}
                </div>

                {d.requester && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {d.requester.avatar_url
                      ? <img src={d.requester.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                          {(d.requester.display_name ?? d.requester.email ?? '?')[0].toUpperCase()}
                        </div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', margin: 0 }}>{d.requester.display_name ?? '—'}</p>
                      <p style={{ fontSize: 11, color: '#7A6A5A', margin: 0 }}>{d.requester.email ?? '—'}</p>
                    </div>
                  </div>
                )}

                {d.message && (
                  <div style={{ backgroundColor: '#FBF7F0', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#3C2C20', lineHeight: 1.5 }}>
                    {d.message}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleProducerAction(d.id, 'approve_create')}
                    disabled={isWorking || d.lat == null || d.lng == null}
                    style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', backgroundColor: d.lat != null && d.lng != null ? '#2D5A3D' : '#D0C8C0', color: '#fff', fontSize: 13, fontWeight: 800, cursor: isWorking ? 'default' : 'pointer', opacity: isWorking ? 0.6 : 1 }}
                  >
                    {isWorking ? '…' : '✓ Créer la fiche producteur'}
                  </button>
                  <button
                    onClick={() => handleProducerAction(d.id, 'reject')}
                    disabled={isWorking}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #E8D0C8', backgroundColor: '#fff', color: '#C4622D', fontSize: 13, fontWeight: 700, cursor: isWorking ? 'default' : 'pointer', opacity: isWorking ? 0.6 : 1 }}
                  >
                    ✕ Refuser
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
