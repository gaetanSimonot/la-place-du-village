'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ETAB_TYPES, descriptionsFiche } from '@/lib/etablissement-types'
import ChampTexteRiche from '@/components/ChampTexteRiche'
import TexteRiche from '@/components/TexteRiche'
import { PLAN_ORDER, PLANS_INFO } from '@/lib/capabilities'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import type { Etablissement } from '@/lib/types'

const s = {
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 },
  aide: { fontSize: 11, color: '#A89886', lineHeight: 1.45, margin: '0 0 6px' },
  input: { width: '100%', background: '#fff', border: '1px solid #E8E0D5', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#2C1810', outline: 'none', boxSizing: 'border-box' as const },
}

const DAY_KEYS   = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const ETAB_TYPES_KEYS = ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite'] as const

interface Props {
  etab: Etablissement
  isAdmin: boolean
  onClose: () => void
  onSaved: (updated: Partial<Etablissement>) => void
}

export default function EtabEditDrawer({ etab, isAdmin, onClose, onSaved }: Props) {
  const [nom, setNom]               = useState(etab.nom)
  const [type, setType]             = useState(etab.type)
  const [descCourte, setDescCourte] = useState(etab.description_courte ?? '')
  const [descLongue, setDescLongue] = useState(etab.description_longue ?? '')
  const [commune, setCommune]       = useState(etab.commune ?? '')
  const [adresse, setAdresse]       = useState(etab.adresse ?? '')
  const [tel, setTel]               = useState(etab.contact_tel ?? '')
  const [whatsapp, setWhatsapp]     = useState(etab.contact_whatsapp ?? '')
  const [siteWeb, setSiteWeb]       = useState(etab.site_web ?? '')
  const [plan, setPlan]             = useState(etab.plan)
  const [statut, setStatut]         = useState(etab.statut)
  const [isFeatured, setIsFeatured] = useState(etab.is_featured)
  const [photos, setPhotos]         = useState<string[]>(etab.photos ?? [])
  const [horaires, setHoraires]     = useState<Record<string, string>>(
    (typeof etab.horaires === 'object' && etab.horaires) ? etab.horaires as Record<string, string> : {}
  )
  const [uploading, setUploading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const n = (v: string) => v.trim() === '' ? null : v.trim()

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || photos.length >= 3) return
    setUploading(true)
    try {
      // Upload direct browser -> Supabase via signed URL (zero transit Vercel)
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.85 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'admin-edit' })
      setPhotos(p => [...p, publicUrl])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const geocode = async () => {
    const q = [adresse, commune, 'France'].filter(Boolean).join(', ')
    if (!q.trim()) return
    setGeocoding(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`, {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      })
      await res.json()
    } finally { setGeocoding(false) }
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const horairesSave = Object.fromEntries(
        DAY_KEYS.map(k => [k, horaires[k]?.trim() || null]).filter(([, v]) => v != null)
      )
      const body: Record<string, unknown> = {
        description_courte: n(descCourte), description_longue: n(descLongue),
        contact_tel: n(tel), contact_whatsapp: n(whatsapp), site_web: n(siteWeb),
        photos, horaires: Object.keys(horairesSave).length > 0 ? horairesSave : null,
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
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001, background: '#FBF7F0', borderRadius: '20px 20px 0 0', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D4C9BA' }} />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2C1810' }}>Modifier la fiche</h2>

          {/* Admin-only controls */}
          {isAdmin && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                {toggle(isFeatured, setIsFeatured, '★ À la une', '#2D5A3D')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {PLAN_ORDER.map(p => {
                  const info = PLANS_INFO[p]
                  return (
                    <button key={p} onClick={() => setPlan(p)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `2px solid ${plan === p ? info.color : '#E8E0D5'}`, background: plan === p ? info.color : '#fff', color: plan === p ? '#fff' : '#999', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase' as const }}>
                      {info.icon} {info.label}
                    </button>
                  )
                })}
              </div>
              <div>
                <label style={s.label}>Statut</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {(['actif', 'publie', 'archive', 'en_attente'] as const).map(st => (
                    <button key={st} onClick={() => setStatut(st)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${statut === st ? '#C4622D' : '#E8E0D5'}`, background: statut === st ? '#C4622D' : '#fff', color: statut === st ? '#fff' : '#999', fontWeight: 700, fontSize: 11, cursor: 'pointer', minWidth: 70 }}>
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
                  <button onClick={geocode} disabled={geocoding} style={{ padding: '0 14px', borderRadius: 12, border: '1px solid #E8E0D5', background: '#fff', fontSize: 18, cursor: 'pointer', opacity: geocoding ? 0.5 : 1 }}>📍</button>
                </div>
              </div>
            </>
          )}

          {error && <div style={{ background: '#FEE2E2', color: '#DC2626', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>{error}</div>}

          {/* Photos — max 3 */}
          <div>
            <label style={s.label}>Photos ({photos.length}/3)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 8 }}>
              {photos.map((url, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
                  <button onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: '#DC2626', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
              ))}
              {photos.length < 3 && (
                <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: 88, height: 88, borderRadius: 12, border: '2px dashed #D0C8C0', background: '#FAF7F2', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#8A7A6A', fontSize: 11, fontWeight: 700 }}>
                  {uploading ? '…' : <><span style={{ fontSize: 24 }}>+</span>Photo</>}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
          </div>

          {/* Les deux textes servent à des endroits DIFFÉRENTS. Les libellés le
              disent, et l'aperçu ci-dessous montre le résultat réel — l'éditeur
              affichait deux champs sans indiquer où chacun atterrissait. */}
          <div>
            <label style={s.label}>Accroche</label>
            <p style={s.aide}>Une phrase. C&apos;est ce qu&apos;on lit dans l&apos;annuaire, sur la carte et dans les résultats de recherche.</p>
            <input
              type="text"
              value={descCourte}
              onChange={e => setDescCourte(e.target.value)}
              placeholder="Ex. Plomberie, dépannage et urgences à Ganges"
              style={s.input}
            />
            <p style={{ ...s.aide, marginTop: 4, marginBottom: 0, textAlign: 'right' as const, color: descCourte.length > 90 ? '#C84B2F' : '#A89886' }}>
              {descCourte.length}/90 {descCourte.length > 90 && '· sera coupée dans les listes'}
            </p>
          </div>
          <div>
            <label style={s.label}>Présentation</label>
            <p style={s.aide}>Le texte de votre fiche. Prenez la place qu&apos;il vous faut.</p>
            <ChampTexteRiche
              valeur={descLongue}
              onChange={setDescLongue}
              rows={6}
              placeholder="Qui vous êtes, ce que vous proposez, ce qui vous distingue…"
            />
          </div>

          {/* Aperçu — même fonction que la fiche publique, donc fidèle */}
          {(() => {
            const { accroche, presentation, accrocheMasquee } = descriptionsFiche(descCourte, descLongue)
            if (!accroche && !presentation) return null
            return (
              <div style={{ background: '#FAF7F2', border: '1px solid #EFE7DC', borderRadius: 14, padding: '12px 14px' }}>
                <p style={{ ...s.aide, marginBottom: 8 }}>Aperçu de votre fiche</p>
                <div style={{ background: '#fff', border: '1px solid #F0EAE0', borderRadius: 12, padding: '12px 14px' }}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>À propos</h3>
                  {/* TexteRiche, comme la fiche : le gras et les titres se
                      voient ici tels qu'ils s'afficheront, pas en astérisques. */}
                  {accroche && <TexteRiche texte={accroche} style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.7, marginBottom: 6 }} />}
                  {presentation && <TexteRiche texte={presentation} style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.7 }} />}
                </div>
                {accrocheMasquee && (
                  <p style={{ ...s.aide, marginTop: 8, marginBottom: 0, color: '#8A7A6A' }}>
                    Votre accroche est déjà reprise au début de la présentation : elle n&apos;est donc pas répétée ici.
                    Elle reste utilisée dans l&apos;annuaire et sur la carte.
                  </p>
                )}
              </div>
            )
          })()}
          {field('Téléphone', tel, setTel, 'tel', '06 12 34 56 78')}
          {field('WhatsApp', whatsapp, setWhatsapp, 'tel', '06 12 34 56 78')}
          {field('Site web', siteWeb, setSiteWeb, 'url', 'https://…')}

          {/* Horaires */}
          <div>
            <label style={s.label}>Horaires</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DAY_KEYS.map((key, i) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 32, fontSize: 12, fontWeight: 700, color: '#6B5E4E', flexShrink: 0 }}>{DAY_LABELS[i]}</span>
                  <input
                    type="text"
                    value={horaires[key] ?? ''}
                    onChange={e => setHoraires(h => ({ ...h, [key]: e.target.value }))}
                    placeholder="9h-12h, 14h-18h"
                    style={{ ...s.input, flex: 1, padding: '8px 10px', fontSize: 13 }}
                  />
                </div>
              ))}
            </div>
          </div>

          <button onClick={save} disabled={saving} style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: saving ? '#aaa' : '#2C1810', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </>
  )
}
