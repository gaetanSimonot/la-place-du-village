'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import type { Etablissement } from '@/lib/types'

const s = {
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 },
  input: { width: '100%', background: '#fff', border: '1px solid #E8E0D5', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#2C1810', outline: 'none', boxSizing: 'border-box' as const },
}

interface Props {
  etab: Etablissement
  isAdmin: boolean
  onClose: () => void
  onSaved: (updated: Partial<Etablissement>) => void
}

const ETAB_TYPES_KEYS = ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite'] as const

export default function EtabEditDrawer({ etab, isAdmin, onClose, onSaved }: Props) {
  const [nom, setNom]           = useState(etab.nom)
  const [type, setType]         = useState(etab.type)
  const [descCourte, setDescCourte] = useState(etab.description_courte ?? '')
  const [descLongue, setDescLongue] = useState(etab.description_longue ?? '')
  const [commune, setCommune]   = useState(etab.commune ?? '')
  const [adresse, setAdresse]   = useState(etab.adresse ?? '')
  const [tel, setTel]           = useState(etab.contact_tel ?? '')
  const [whatsapp, setWhatsapp] = useState(etab.contact_whatsapp ?? '')
  const [siteWeb, setSiteWeb]   = useState(etab.site_web ?? '')
  const [plan, setPlan]         = useState(etab.plan)
  const [statut, setStatut]     = useState(etab.statut)
  const [isFeatured, setIsFeatured] = useState(etab.is_featured)
  const [geocoding, setGeocoding] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const n = (v: string) => v.trim() === '' ? null : v.trim()

  const geocode = async () => {
    const q = [adresse, commune, 'France'].filter(Boolean).join(', ')
    if (!q.trim()) return
    setGeocoding(true)
    try {
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`)
      const d = await res.json()
      if (d.lat) { /* lat/lng stored server-side only, user sees confirmation */ }
    } finally { setGeocoding(false) }
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const body: Record<string, unknown> = {
        description_courte: n(descCourte), description_longue: n(descLongue),
        contact_tel: n(tel), contact_whatsapp: n(whatsapp), site_web: n(siteWeb),
      }
      if (isAdmin) {
        Object.assign(body, {
          nom: n(nom) ?? etab.nom, type, commune: n(commune), adresse: n(adresse),
          plan, statut, is_featured: isFeatured,
        })
      }

      const res = await fetch(`/api/etablissements/${etab.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Erreur serveur')

      onSaved(body as Partial<Etablissement>)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally { setSaving(false) }
  }

  const field = (label: string, value: string, set: (v: string) => void, type = 'text', placeholder = '') => (
    <div>
      <label style={s.label}>{label}</label>
      <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder} style={s.input} />
    </div>
  )

  const toggle = (active: boolean, setActive: (v: boolean) => void, label: string, color: string) => (
    <button onClick={() => setActive(!active)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `2px solid ${active ? color : '#E8E0D5'}`, background: active ? color : '#fff', color: active ? '#fff' : '#999', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
      {label}
    </button>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001, background: '#FBF7F0', borderRadius: '20px 20px 0 0', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D4C9BA' }} />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px 36px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2C1810' }}>Modifier la fiche</h2>

          {isAdmin && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                {toggle(isFeatured, setIsFeatured, '★ À la une', '#2D5A3D')}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {(['basic', 'pro', 'max'] as const).map(p => (
                  <button key={p} onClick={() => setPlan(p)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `2px solid ${plan === p ? '#2C1810' : '#E8E0D5'}`, background: plan === p ? '#2C1810' : '#fff', color: plan === p ? '#fff' : '#999', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase' as const }}>
                    {p}
                  </button>
                ))}
              </div>

              <div>
                <label style={s.label}>Statut</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['actif', 'publie', 'archive', 'en_attente'] as const).map(st => (
                    <button key={st} onClick={() => setStatut(st)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${statut === st ? '#C4622D' : '#E8E0D5'}`, background: statut === st ? '#C4622D' : '#fff', color: statut === st ? '#fff' : '#999', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {field('Nom', nom, setNom, 'text', 'Nom de l\'établissement')}

              <div>
                <label style={s.label}>Type</label>
                <select value={type} onChange={e => setType(e.target.value as typeof type)} style={s.input}>
                  {ETAB_TYPES_KEYS.map(t => <option key={t} value={t}>{ETAB_TYPES[t]?.emoji} {ETAB_TYPES[t]?.label}</option>)}
                </select>
              </div>

              {field('Commune', commune, setCommune, 'text', 'Ganges, Saint-Hippolyte…')}

              <div>
                <label style={s.label}>Adresse</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="12 rue de la Paix…" style={{ ...s.input, flex: 1 }} />
                  <button onClick={geocode} disabled={geocoding} title="Géocoder" style={{ padding: '0 14px', borderRadius: 12, border: '1px solid #E8E0D5', background: '#fff', fontSize: 18, cursor: 'pointer', opacity: geocoding ? 0.5 : 1 }}>📍</button>
                </div>
              </div>
            </>
          )}

          {error && <div style={{ background: '#FEE2E2', color: '#DC2626', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>{error}</div>}

          {field('Description courte', descCourte, setDescCourte, 'text', 'Accroche en une phrase…')}
          <div>
            <label style={s.label}>Description longue</label>
            <textarea value={descLongue} onChange={e => setDescLongue(e.target.value)} rows={4} placeholder="Présentation détaillée…" style={{ ...s.input, resize: 'none', lineHeight: 1.5 }} />
          </div>
          {field('Téléphone', tel, setTel, 'tel', '06 12 34 56 78')}
          {field('WhatsApp', whatsapp, setWhatsapp, 'tel', '06 12 34 56 78')}
          {field('Site web', siteWeb, setSiteWeb, 'url', 'https://…')}

          <button onClick={save} disabled={saving} style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: saving ? '#aaa' : '#2C1810', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </>
  )
}
