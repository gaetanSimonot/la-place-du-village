'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Producer { id: string; nom: string; is_max: boolean; photo: string | null; commune: string | null }
interface Membre {
  id: string; email: string; name: string; avatar: string
  created_at: string; last_sign_in: string | null
  producer: Producer | null
}

export default function MembresAdmin() {
  const [membres, setMembres] = useState<Membre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editCommune, setEditCommune] = useState('')

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const t = await token()
    const r = await fetch('/api/admin/membres', { headers: { Authorization: `Bearer ${t}` } })
    const d = await r.json()
    setMembres(d.membres ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  const expand = (m: Membre) => {
    if (expandedId === m.id) { setExpandedId(null); return }
    setExpandedId(m.id)
    setEditNom(m.producer?.nom ?? '')
    setEditCommune(m.producer?.commune ?? '')
  }

  const toggleMax = async (e: React.MouseEvent, producerId: string, current: boolean) => {
    e.stopPropagation()
    setSaving(producerId)
    const t = await token()
    await fetch('/api/admin/membres', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ producer_id: producerId, is_max: !current }),
    })
    await fetchAll()
    setSaving(null)
  }

  const createProducer = async (e: React.MouseEvent, membre: Membre) => {
    e.stopPropagation()
    if (!editNom.trim()) return
    setSaving(membre.id)
    const t = await token()
    await fetch('/api/admin/producteurs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ nom: editNom.trim(), commune: editCommune.trim() || null, user_email: membre.email }),
    })
    await fetchAll()
    setSaving(null)
  }

  const removeProducer = async (e: React.MouseEvent, producerId: string) => {
    e.stopPropagation()
    if (!confirm('Retirer le profil producteur de ce membre ?')) return
    setSaving(producerId)
    const t = await token()
    await fetch(`/api/admin/producteurs/${producerId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
    await fetchAll()
    setSaving(null)
  }

  const saveProducer = async (e: React.MouseEvent, producerId: string) => {
    e.stopPropagation()
    setSaving(producerId)
    const t = await token()
    await fetch(`/api/admin/producteurs/${producerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ nom: editNom.trim(), commune: editCommune.trim() || null }),
    })
    await fetchAll()
    setSaving(null)
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })

  const filtered = membres.filter(m =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.producer?.nom ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#9A8A7A', fontFamily: 'Inter, sans-serif' }}>
      Chargement des membres…
    </div>
  )

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EBE0', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email, boutique…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 13, outline: 'none', backgroundColor: '#FBF7F0', color: '#2C1810' }}
        />
        <span style={{ fontSize: 12, color: '#9A8A7A', whiteSpace: 'nowrap' }}>
          {filtered.length}/{membres.length} · {membres.filter(m => m.producer).length} prod · {membres.filter(m => m.producer?.is_max).length} MAX
        </span>
      </div>

      <div style={{ paddingBottom: 40 }}>
        {filtered.map(m => {
          const isExpanded = expandedId === m.id
          const isSaving = saving === m.id || (m.producer ? saving === m.producer.id : false)

          return (
            <div key={m.id} style={{ borderBottom: '1px solid #F5F0E8' }}>
              {/* Row — clickable */}
              <div
                onClick={() => expand(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', backgroundColor: isExpanded ? '#F8F4ED' : 'transparent', transition: 'background 0.15s' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.avatar
                    ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 15, color: '#2D5A3D', fontWeight: 700 }}>{(m.name || m.email)[0]?.toUpperCase()}</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1209' }}>
                      {m.name || <span style={{ color: '#9A8A7A' }}>Sans nom</span>}
                    </span>
                    {m.producer && (
                      <span style={{ fontSize: 10, color: '#2D5A3D', fontWeight: 700, backgroundColor: '#E8F2EB', padding: '1px 6px', borderRadius: 999 }}>
                        🌿 {m.producer.nom}{m.producer.commune ? `, ${m.producer.commune}` : ''}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#B0A898' }}>
                    Inscrit {fmt(m.created_at)}{m.last_sign_in && ` · Actif ${fmt(m.last_sign_in)}`}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {m.producer && (
                    <span
                      onClick={e => toggleMax(e, m.producer!.id, m.producer!.is_max)}
                      style={{
                        padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10, fontWeight: 800,
                        backgroundColor: m.producer.is_max ? '#E8622A' : '#E8F2EB',
                        color: m.producer.is_max ? '#fff' : '#2D5A3D',
                        opacity: isSaving ? 0.6 : 1, transition: 'all 0.15s', userSelect: 'none',
                      }}
                    >
                      {m.producer.is_max ? '★ MAX' : '○ Basic'}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#C0B8B0', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </div>
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div style={{ backgroundColor: '#F8F4ED', borderTop: '1px solid #EDE8DF', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Producer section */}
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profil producteur</p>

                    {m.producer ? (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input
                            value={editNom} onChange={e => setEditNom(e.target.value)}
                            placeholder="Nom de la boutique"
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 2, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 12, outline: 'none', backgroundColor: '#fff', color: '#2C1810' }}
                          />
                          <input
                            value={editCommune} onChange={e => setEditCommune(e.target.value)}
                            placeholder="Commune"
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 12, outline: 'none', backgroundColor: '#fff', color: '#2C1810' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={e => saveProducer(e, m.producer!.id)}
                            disabled={!!isSaving}
                            style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isSaving ? 0.6 : 1 }}
                          >
                            {isSaving ? '…' : 'Sauvegarder'}
                          </button>
                          <button
                            onClick={e => removeProducer(e, m.producer!.id)}
                            disabled={!!isSaving}
                            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #E8D0C8', backgroundColor: '#FFF8F5', color: '#C4622D', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Retirer
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9A8A7A' }}>Pas encore de profil producteur.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            value={editNom} onChange={e => setEditNom(e.target.value)}
                            placeholder="Nom de la ferme / boutique"
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 12, outline: 'none', backgroundColor: '#fff', color: '#2C1810' }}
                          />
                          <button
                            onClick={e => createProducer(e, m)}
                            disabled={!editNom.trim() || !!isSaving}
                            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!editNom.trim() || !!isSaving) ? 0.5 : 1 }}
                          >
                            {isSaving ? '…' : '+ Créer'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Plan — only if producer */}
                  {m.producer && (
                    <div>
                      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan d&apos;abonnement</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={e => { if (m.producer!.is_max) { toggleMax(e, m.producer!.id, true) } else { e.stopPropagation() } }}
                          style={{
                            flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer',
                            border: m.producer.is_max ? '1.5px solid #E0D8CE' : '2px solid #2D5A3D',
                            backgroundColor: m.producer.is_max ? '#F0EBE0' : '#E8F2EB',
                            color: m.producer.is_max ? '#9A8A7A' : '#2D5A3D',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          ○ Basic
                        </button>
                        <button
                          onClick={e => { if (!m.producer!.is_max) { toggleMax(e, m.producer!.id, false) } else { e.stopPropagation() } }}
                          style={{
                            flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer',
                            border: m.producer.is_max ? '2px solid #E8622A' : '1.5px solid #E0D8CE',
                            backgroundColor: m.producer.is_max ? '#FFF0EB' : '#F0EBE0',
                            color: m.producer.is_max ? '#E8622A' : '#9A8A7A',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          ★ MAX
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9A8A7A', fontSize: 13 }}>
            Aucun membre trouvé.
          </div>
        )}
      </div>
    </div>
  )
}
