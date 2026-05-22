'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import ProductsEditSection from '@/components/ProductsEditSection'

interface Producer {
  id: string; nom: string; description_courte: string | null; description_longue: string | null
  commune: string | null; adresse: string | null; lat: number | null; lng: number | null
  contact_tel: string | null; contact_whatsapp: string | null; site_web: string | null; photos: string[]
  vente_directe: boolean; retrait_sur_place: boolean
}
type Suggestion = { place_id: string; description: string; main: string; secondary: string }

const PRO_TYPES = [
  { id: 'producteur',    label: '🌿 Producteur local' },
  { id: 'artisan',       label: '🔨 Artisan' },
  { id: 'restaurateur',  label: '🍽 Restaurateur' },
  { id: 'commercant',    label: '🛍 Commerçant' },
  { id: 'association',   label: '🤝 Association' },
  { id: 'prestataire',   label: '💼 Prestataire' },
  { id: 'autre',         label: '● Autre' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 10, border: '1px solid #DDD', fontFamily: 'Inter, sans-serif',
  fontSize: 14, color: '#2C1810', outline: 'none', backgroundColor: '#FAFAFA',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#6B6B6B', fontFamily: 'Inter, sans-serif',
  display: 'block', marginBottom: 4,
}

export default function MonEspaceProducteur() {
  const [plan, setPlan] = useState<string | null>(null)
  const [proType, setProType] = useState<string | null>(null)
  const [producer, setProducer] = useState<Producer | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editData, setEditData] = useState<Partial<Producer>>({})
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [addrQuery, setAddrQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function fetchData() {
    const token = await getToken()
    if (!token) { setLoading(false); return }
    const res = await fetch('/api/mon-producteur', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { setLoading(false); return }
    const d = await res.json()
    setPlan(d.plan)
    setProType(d.pro_type ?? null)
    setProducer(d.producer ?? null)
    setLoading(false)
  }

  function startEdit() {
    if (!producer) return
    setEditData({ ...producer })
    setAddrQuery(producer.adresse ?? '')
    setSuggestions([])
    setEditing(true)
  }

  function startCreate(preType?: string) {
    setEditData({ nom: '', photos: [] })
    setAddrQuery('')
    setSuggestions([])
    if (preType) setProType(preType)
    setCreating(true)
  }

  async function saveProfile() {
    if (!editData.nom?.trim()) return
    setSaving(true)
    const token = await getToken()
    const method = producer ? 'PATCH' : 'POST'
    const res = await fetch('/api/mon-producteur', {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editData, pro_type: proType }),
    })
    if (res.ok) {
      const d = await res.json()
      setProducer(d.producer)
      setEditing(false)
      setCreating(false)
    }
    setSaving(false)
  }

  function onAddrChange(val: string) {
    setAddrQuery(val)
    setEditData(p => ({ ...p, adresse: val }))
    if (addrTimer.current) clearTimeout(addrTimer.current)
    addrTimer.current = setTimeout(async () => {
      if (val.length < 3) { setSuggestions([]); return }
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const res = await fetch(`/api/admin/autocomplete?q=${encodeURIComponent(val)}`, {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      })
      const d = await res.json()
      setSuggestions(d.predictions ?? [])
    }, 350)
  }

  async function selectAddress(s: Suggestion) {
    setAddrQuery(s.description)
    setSuggestions([])
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const res = await fetch(`/api/admin/geocode?place_id=${s.place_id}`, {
      headers: tk ? { Authorization: `Bearer ${tk}` } : {},
    })
    const d = await res.json()
    setEditData(p => ({
      ...p,
      adresse: d.adresse ?? s.description,
      commune: d.commune ?? p.commune,
      lat: d.lat ?? p.lat,
      lng: d.lng ?? p.lng,
    }))
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    try {
      // Upload direct browser -> Supabase via signed URL (kind event-image
      // -> path formulaire/..., accepte tout user authentifie).
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.85 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'event-image' })
      setEditData(p => ({ ...p, photos: [...(p.photos ?? []), publicUrl].slice(0, 3) }))
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function deleteProducer() {
    if (!confirm('Supprimer votre fiche et tous vos produits ?')) return
    if (!confirm('Cette action est irréversible. Confirmer ?')) return
    const token = await getToken()
    const res = await fetch('/api/mon-producteur', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { setProducer(null) }
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>Chargement...</div>

  if (plan !== 'pro') return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>★</div>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', marginBottom: 8 }}>Plan Partenaire Local requis</h2>
      <p style={{ fontSize: 14, color: '#8A8A8A', lineHeight: 1.6, margin: 0 }}>L&apos;espace producteur est réservé aux Partenaires Locaux. Contactez l&apos;administrateur ou passe Partenaire pour accéder à cette fonctionnalité.</p>
    </div>
  )

  // Edit / Create form
  if (editing || creating) return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => { setEditing(false); setCreating(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6B6B6B' }}>←</button>
        <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 17, color: '#2C1810', margin: 0 }}>
          {creating ? 'Créer ma fiche' : 'Modifier ma fiche'}
        </h2>
      </div>

      {/* Catégorie */}
      <div style={{ marginBottom: 20 }}>
        <span style={labelStyle}>Votre activité *</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRO_TYPES.map(t => (
            <button key={t.id} onClick={() => setProType(t.id)} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
              backgroundColor: proType === t.id ? 'var(--primary)' : '#EDE8E0',
              color: proType === t.id ? '#fff' : '#555',
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div style={{ marginBottom: 20 }}>
        <span style={labelStyle}>Photos (max 3)</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(editData.photos ?? []).map((url, i) => (
            <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
              <img src={url} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
              <button onClick={() => setEditData(p => ({ ...p, photos: (p.photos ?? []).filter((_, j) => j !== i) }))}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#E8622A', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: '20px', textAlign: 'center' }}>×</button>
            </div>
          ))}
          {(editData.photos ?? []).length < 3 && (
            <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
              style={{ width: 72, height: 72, borderRadius: 10, border: '2px dashed #CCC', background: 'none', cursor: 'pointer', fontSize: 24, color: '#999' }}>
              {uploadingPhoto ? '...' : '+'}
            </button>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = '' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nom *</label>
          <input style={inputStyle} value={editData.nom ?? ''} onChange={e => setEditData(p => ({ ...p, nom: e.target.value }))} placeholder="Nom de votre exploitation" />
        </div>
        <div>
          <label style={labelStyle}>Présentation courte</label>
          <input style={inputStyle} value={editData.description_courte ?? ''} onChange={e => setEditData(p => ({ ...p, description_courte: e.target.value }))} placeholder="Une phrase de présentation" />
        </div>
        <div>
          <label style={labelStyle}>Description complète</label>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={editData.description_longue ?? ''} onChange={e => setEditData(p => ({ ...p, description_longue: e.target.value }))} placeholder="Décrivez vos produits, votre démarche..." />
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Adresse</label>
            <span style={{ fontSize: 11, fontWeight: 700, color: editData.lat && editData.lng ? '#2D5A3D' : '#E8622A' }}>
              {editData.lat && editData.lng ? '✓ Localisé sur la carte' : '⚠ Position non définie'}
            </span>
          </div>
          <input style={inputStyle} value={addrQuery} onChange={e => onAddrChange(e.target.value)} placeholder="Commencez à taper l'adresse..." />
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden' }}>
              {suggestions.map(s => (
                <button key={s.place_id} onMouseDown={() => selectAddress(s)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '1px solid #F0F0F0' }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#2C1810' }}>{s.main || s.description}</p>
                    {s.secondary && <p style={{ margin: 0, fontSize: 11, color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>{s.secondary}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Commune</label>
          <input style={inputStyle} value={editData.commune ?? ''} onChange={e => setEditData(p => ({ ...p, commune: e.target.value }))} placeholder="Ganges, Saint-Bauzille..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Téléphone</label>
            <input style={inputStyle} value={editData.contact_tel ?? ''} onChange={e => setEditData(p => ({ ...p, contact_tel: e.target.value }))} placeholder="06 ..." />
          </div>
          <div>
            <label style={labelStyle}>WhatsApp</label>
            <input style={inputStyle} value={editData.contact_whatsapp ?? ''} onChange={e => setEditData(p => ({ ...p, contact_whatsapp: e.target.value }))} placeholder="06 ..." />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Site web</label>
          <input style={inputStyle} value={editData.site_web ?? ''} onChange={e => setEditData(p => ({ ...p, site_web: e.target.value }))} placeholder="https://..." />
        </div>
        <div>
          <span style={labelStyle}>Informations pratiques</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              { key: 'vente_directe' as const, label: 'Vente directe' },
              { key: 'retrait_sur_place' as const, label: 'À retirer sur place / marché' },
            ] as { key: 'vente_directe' | 'retrait_sur_place'; label: string }[]).map(({ key, label }) => {
              const val = editData[key] !== false
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, backgroundColor: '#F0EDE8' }}>
                  <span style={{ fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#2C1810' }}>{label}</span>
                  <button onClick={() => setEditData(p => ({ ...p, [key]: !val }))}
                    style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', backgroundColor: val ? 'var(--primary)' : '#CCC', position: 'relative', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', left: val ? 20 : 2 }} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button onClick={saveProfile} disabled={saving || !editData.nom?.trim() || !proType} style={{
        marginTop: 24, width: '100%', padding: '14px', borderRadius: 12, border: 'none',
        backgroundColor: saving || !editData.nom?.trim() || !proType ? '#CCC' : 'var(--primary)',
        color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer',
      }}>
        {saving ? 'Enregistrement...' : 'Enregistrer ma fiche'}
      </button>
    </div>
  )

  // No producer yet
  if (!producer) return (
    <div style={{ padding: '24px 0 40px' }}>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', marginBottom: 4 }}>Créez votre fiche</h2>
      <p style={{ fontSize: 14, color: '#8A8A8A', lineHeight: 1.6, marginBottom: 20, margin: '0 0 20px' }}>Votre plan MAX vous permet d&apos;apparaître dans l&apos;annuaire. Commencez par choisir votre activité.</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B6B6B', fontFamily: 'Inter, sans-serif', marginBottom: 10 }}>Je suis…</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {PRO_TYPES.map(t => (
          <button key={t.id} onClick={() => setProType(t.id)} style={{
            padding: '10px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
            backgroundColor: proType === t.id ? 'var(--primary)' : '#EDE8E0',
            color: proType === t.id ? '#fff' : '#555',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>
      <button onClick={() => startCreate()} disabled={!proType} style={{
        width: '100%', padding: '14px', borderRadius: 12, border: 'none',
        backgroundColor: proType ? 'var(--primary)' : '#CCC',
        color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15,
        cursor: proType ? 'pointer' : 'default',
      }}>
        Créer ma fiche →
      </button>
    </div>
  )

  // View mode + products
  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Profile card */}
      <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          {producer.photos?.[0]
            ? <img src={producer.photos[0]} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🌿</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 17, color: '#2C1810', margin: '0 0 2px' }}>{producer.nom}</p>
            {producer.commune && <p style={{ fontSize: 12, color: '#8A8A8A', margin: '0 0 4px' }}>📍 {producer.commune}</p>}
            {producer.description_courte && <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.4 }}>{producer.description_courte}</p>}
          </div>
        </div>
        {producer.contact_tel && <p style={{ fontSize: 12, color: '#8A8A8A', margin: '0 0 2px' }}>📞 {producer.contact_tel}</p>}
        {producer.contact_whatsapp && <p style={{ fontSize: 12, color: '#8A8A8A', margin: '0 0 2px' }}>💬 {producer.contact_whatsapp}</p>}
        {producer.site_web && <p style={{ fontSize: 12, color: '#8A8A8A', margin: 0 }}>🔗 {producer.site_web}</p>}
        <button onClick={startEdit} style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--primary)', backgroundColor: 'transparent', color: 'var(--primary)', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          Modifier ma fiche
        </button>
        <button onClick={deleteProducer} style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #E8622A', backgroundColor: 'transparent', color: '#E8622A', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          Supprimer ma fiche
        </button>
      </div>

      <ProductsEditSection producerId={producer.id} />
    </div>
  )
}
