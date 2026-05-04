'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ProducerEditData {
  id: string
  nom: string
  description_courte: string | null
  description_longue: string | null
  commune: string | null
  adresse: string | null
  lat: number | null
  lng: number | null
  contact_tel: string | null
  contact_whatsapp: string | null
  site_web: string | null
  photos: string[]
  is_max: boolean
  is_featured: boolean
}

interface Props {
  producer: ProducerEditData
  onClose: () => void
  onSaved: (updated: ProducerEditData) => void
}

const s = {
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 },
  input: { width: '100%', background: '#fff', border: '1px solid #E8E0D5', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#2C1810', outline: 'none', boxSizing: 'border-box' as const },
  field: { marginBottom: 0 },
}

export default function ProducerEditDrawer({ producer, onClose, onSaved }: Props) {
  const [nom, setNom]                         = useState(producer.nom)
  const [descCourte, setDescCourte]           = useState(producer.description_courte ?? '')
  const [descLongue, setDescLongue]           = useState(producer.description_longue ?? '')
  const [commune, setCommune]                 = useState(producer.commune ?? '')
  const [adresse, setAdresse]                 = useState(producer.adresse ?? '')
  const [lat, setLat]                         = useState<number | null>(producer.lat)
  const [lng, setLng]                         = useState<number | null>(producer.lng)
  const [tel, setTel]                         = useState(producer.contact_tel ?? '')
  const [whatsapp, setWhatsapp]               = useState(producer.contact_whatsapp ?? '')
  const [siteWeb, setSiteWeb]                 = useState(producer.site_web ?? '')
  const [photos, setPhotos]                   = useState<string[]>(producer.photos ?? [])
  const [isFeatured, setIsFeatured]           = useState(producer.is_featured)
  const [isMax, setIsMax]                     = useState(producer.is_max)
  const [geocoding, setGeocoding]             = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  const n = (v: string): string | null => v.trim() === '' ? null : v.trim()

  const geocode = async () => {
    const q = [adresse, commune, 'France'].filter(Boolean).join(', ')
    if (!q.trim()) return
    setGeocoding(true)
    try {
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`)
      const d = await res.json()
      if (d.lat) { setLat(d.lat); setLng(d.lng) }
    } finally { setGeocoding(false) }
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/admin/producteurs/${producer.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          nom: n(nom), description_courte: n(descCourte), description_longue: n(descLongue),
          commune: n(commune), adresse: n(adresse), lat, lng,
          contact_tel: n(tel), contact_whatsapp: n(whatsapp), site_web: n(siteWeb),
          is_featured: isFeatured, is_max: isMax, photos,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Erreur serveur')
      onSaved({ ...producer, nom: n(nom) ?? producer.nom, description_courte: n(descCourte), description_longue: n(descLongue), commune: n(commune), adresse: n(adresse), lat, lng, contact_tel: n(tel), contact_whatsapp: n(whatsapp), site_web: n(siteWeb), is_featured: isFeatured, is_max: isMax, photos })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally { setSaving(false) }
  }

  const toggle = (active: boolean, setActive: (v: boolean) => void, label: string, color: string) => (
    <button onClick={() => setActive(!active)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `2px solid ${active ? color : '#E8E0D5'}`, background: active ? color : '#fff', color: active ? '#fff' : '#999', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
      {label}
    </button>
  )

  const field = (label: string, value: string, set: (v: string) => void, type = 'text', placeholder = '') => (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder} style={s.input} />
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />

      {/* Drawer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001, background: '#FBF7F0', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D4C9BA' }} />
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2C1810' }}>Modifier le producteur</h2>

          {/* Admin toggles */}
          <div style={{ display: 'flex', gap: 10 }}>
            {toggle(isFeatured, setIsFeatured, '★ À la une', '#2D5A3D')}
            {toggle(isMax, setIsMax, '⚡ Plan MAX', '#E8622A')}
          </div>

          {error && <div style={{ background: '#FEE2E2', color: '#DC2626', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>{error}</div>}

          {field('Nom', nom, setNom, 'text', 'Nom du producteur')}
          {field('Description courte', descCourte, setDescCourte, 'text', 'Accroche en une phrase…')}

          <div>
            <label style={s.label}>Description longue</label>
            <textarea value={descLongue} onChange={e => setDescLongue(e.target.value)} rows={4} placeholder="Présentation détaillée…" style={{ ...s.input, resize: 'none', lineHeight: 1.5 }} />
          </div>

          {field('Commune', commune, setCommune, 'text', 'Ganges, Saint-Hippolyte…')}

          {/* Adresse + géocodage */}
          <div>
            <label style={s.label}>Adresse</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="12 rue de la Paix…" style={{ ...s.input, flex: 1 }} />
              <button onClick={geocode} disabled={geocoding} title="Géocoder" style={{ padding: '0 14px', borderRadius: 12, border: '1px solid #E8E0D5', background: '#fff', fontSize: 18, cursor: 'pointer', opacity: geocoding ? 0.5 : 1, flexShrink: 0 }}>📍</button>
            </div>
            {lat !== null && lng !== null && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#2D5A3D', fontWeight: 600 }}>✓ {lat.toFixed(5)}, {lng.toFixed(5)}</p>
            )}
          </div>

          {field('Téléphone', tel, setTel, 'tel', '06 12 34 56 78')}
          {field('WhatsApp', whatsapp, setWhatsapp, 'tel', '06 12 34 56 78')}
          {field('Site web', siteWeb, setSiteWeb, 'url', 'https://…')}

          {/* Photos strip */}
          {photos.length > 0 && (
            <div>
              <label style={s.label}>Photos ({photos.length})</label>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {photos.map((url, i) => (
                  <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                    <button onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#DC2626', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save */}
          <button onClick={save} disabled={saving} style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: saving ? '#aaa' : '#2C1810', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </>
  )
}
