'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'

interface Promotion {
  id: string
  title: string
  description: string | null
  image_url: string | null
  conditions: string | null
  frequency: 'always' | 'weekly' | 'monthly'
  valid_from: string | null
  valid_until: string | null
  active: boolean
  use_count: number
  created_at: string
}

const FREQ_OPTIONS: { value: 'always' | 'weekly' | 'monthly'; label: string }[] = [
  { value: 'always',  label: '1 fois (toujours)' },
  { value: 'weekly',  label: '1× par semaine' },
  { value: 'monthly', label: '1× par mois' },
]

interface Props {
  etablissementId: string
  /** Photos de l'établissement, pour piocher l'image d'une promo sans upload. */
  etablissementPhotos?: string[]
}

export default function PromotionsManager({ etablissementId, etablissementPhotos = [] }: Props) {
  const [promos, setPromos] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [creating, setCreating] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    const r = await fetch(`/api/promotions?mine=1&etab=${etablissementId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (r.ok) {
      const d = await r.json()
      setPromos(d.promotions ?? [])
    }
    setLoading(false)
  }, [etablissementId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette promotion ? Cette action est irréversible.')) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const r = await fetch(`/api/promotions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (r.ok) fetchAll()
  }

  const handleToggleActive = async (promo: Promotion) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/promotions/${promo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ active: !promo.active }),
    })
    fetchAll()
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#C4622D', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
            🎁 Mes promotions
          </p>
          <p style={{ fontSize: 11, color: '#7A6A5A', margin: 0 }}>
            Offres exclusives visibles par vos clients abonnés Pro
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 14px', borderRadius: 10, border: 'none',
            backgroundColor: '#C4622D', color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          + Nouvelle
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: '#9A8A7A', textAlign: 'center', padding: 14 }}>Chargement…</p>
      ) : promos.length === 0 ? (
        <div style={{
          padding: '24px 14px', textAlign: 'center',
          backgroundColor: '#FFFBF2', borderRadius: 12,
          border: '1px dashed #E0D8CE',
        }}>
          <p style={{ fontSize: 28, margin: '0 0 6px' }}>🎁</p>
          <p style={{ fontSize: 12, color: '#7A6A5A', margin: 0 }}>
            Aucune promotion. Créez votre première offre pour fidéliser vos clients.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {promos.map(p => (
            <div key={p.id} style={{
              backgroundColor: p.active ? '#fff' : '#F5EFE5',
              borderRadius: 12,
              padding: '12px 14px',
              border: '1px solid #E8E0D5',
              opacity: p.active ? 1 : 0.7,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {p.image_url && (
                  <img src={p.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1209', margin: 0 }}>
                    {p.title}
                  </p>
                  <p style={{ fontSize: 10, color: '#9A8A7A', margin: '2px 0 0' }}>
                    {FREQ_OPTIONS.find(f => f.value === p.frequency)?.label}
                    {p.use_count > 0 && ` · ★ ${p.use_count} utilisation${p.use_count > 1 ? 's' : ''}`}
                    {!p.active && ' · ⏸ désactivée'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing(p)} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #E0D8CE', backgroundColor: '#fff', color: '#3C2C20', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  ✏️ Modifier
                </button>
                <button onClick={() => handleToggleActive(p)} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #E0D8CE', backgroundColor: '#fff', color: p.active ? '#A0654E' : '#2D5A3D', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {p.active ? '⏸ Désactiver' : '▶️ Activer'}
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #FBDADA', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PromotionForm
          etablissementId={etablissementId}
          etablissementPhotos={etablissementPhotos}
          promo={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); fetchAll() }}
        />
      )}
    </div>
  )
}

export function PromotionForm({ etablissementId, etablissementPhotos, promo, onClose, onSaved }: {
  etablissementId: string
  etablissementPhotos: string[]
  promo: Promotion | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle]         = useState(promo?.title ?? '')
  const [description, setDescription] = useState(promo?.description ?? '')
  const [conditions, setConditions] = useState(promo?.conditions ?? '')
  const [imageUrl, setImageUrl]   = useState(promo?.image_url ?? '')
  const [frequency, setFrequency] = useState<'always'|'weekly'|'monthly'>(promo?.frequency ?? 'monthly')
  const [validUntil, setValidUntil] = useState(promo?.valid_until ? promo.valid_until.slice(0, 10) : '')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    setUploading(true); setError(null)
    try {
      // Upload direct browser -> Supabase via signed URL (kind admin-edit)
      const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'admin-edit' })
      setImageUrl(publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload')
    }
    setUploading(false)
  }

  const save = async () => {
    if (!title.trim()) return
    setSaving(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const body = {
      etablissement_id: etablissementId,
      title: title.trim(),
      description: description.trim() || null,
      conditions: conditions.trim() || null,
      image_url: imageUrl || null,
      frequency,
      valid_until: validUntil || null,
    }
    const url = promo ? `/api/promotions/${promo.id}` : '/api/promotions'
    const method = promo ? 'PATCH' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (r.ok) onSaved()
    else {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, backgroundColor: '#fff',
        borderRadius: '24px 24px 0 0', padding: '20px 20px 28px',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        maxHeight: '92dvh', overflowY: 'auto', fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1A1209', margin: 0, letterSpacing: '-0.01em' }}>
            {promo ? 'Modifier la promo' : 'Nouvelle promotion'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Titre">
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="ex: 1 verre offert"
              style={inp}
              maxLength={80}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Détails de l'offre..."
              rows={2} style={{ ...inp, resize: 'none', lineHeight: 1.4 }}
              maxLength={400}
            />
          </Field>

          <Field label="Conditions (facultatif)">
            <input
              type="text" value={conditions} onChange={e => setConditions(e.target.value)}
              placeholder="ex: Pour tout repas commandé, midi et soir"
              style={inp} maxLength={200}
            />
          </Field>

          <Field label="Fréquence d'utilisation par client">
            <div style={{ display: 'flex', gap: 6 }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setFrequency(opt.value)} style={{
                  flex: 1, padding: '9px 6px', borderRadius: 8, cursor: 'pointer',
                  border: frequency === opt.value ? '2px solid #C4622D' : '1.5px solid #E0D8CE',
                  backgroundColor: frequency === opt.value ? '#FFF0E5' : '#fff',
                  color: frequency === opt.value ? '#C4622D' : '#7A6A5A',
                  fontSize: 11, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Valable jusqu'au (facultatif)">
            <input
              type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
              style={inp}
            />
          </Field>

          <Field label="Image (facultatif — sinon la 1re photo de votre fiche)">
            {imageUrl ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <img src={imageUrl} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
                <button onClick={() => setImageUrl('')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #FBDADA', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  Retirer
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                    style={{ display: 'none' }}
                  />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E0D8CE', backgroundColor: '#fff', color: '#3C2C20', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    {uploading ? 'Upload…' : '📷 Uploader une image'}
                  </button>
                </div>

                {etablissementPhotos.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, color: '#9A8A7A', margin: '0 0 6px' }}>
                      Ou choisir parmi les photos de votre fiche :
                    </p>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                      {etablissementPhotos.slice(0, 8).map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setImageUrl(url)}
                          style={{
                            flexShrink: 0, padding: 0, border: 'none',
                            background: 'none', cursor: 'pointer',
                            borderRadius: 8, overflow: 'hidden',
                          }}
                          aria-label={`Photo ${i + 1}`}
                        >
                          <img
                            src={url} alt={`photo ${i + 1}`}
                            style={{ width: 56, height: 56, objectFit: 'cover', display: 'block', borderRadius: 8, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p style={{ fontSize: 10, color: '#B0A898', margin: 0, fontStyle: 'italic' }}>
                  💡 Sans image, la 1re photo de votre fiche sera utilisée automatiquement.
                </p>
              </div>
            )}
          </Field>

          {error && <p style={{ fontSize: 12, color: '#E53935', margin: '4px 0 0' }}>{error}</p>}

          <button
            onClick={save}
            disabled={saving || !title.trim()}
            style={{
              marginTop: 8, width: '100%', padding: '14px',
              backgroundColor: '#C4622D', color: '#fff',
              border: 'none', borderRadius: 12,
              fontSize: 14, fontWeight: 700,
              cursor: saving || !title.trim() ? 'default' : 'pointer',
              opacity: saving || !title.trim() ? 0.5 : 1,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {saving ? 'Enregistrement…' : (promo ? 'Mettre à jour' : 'Créer la promotion')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #E0D8CE', fontSize: 13, outline: 'none',
  backgroundColor: '#FBF7F0', color: '#2C1810',
  boxSizing: 'border-box', fontFamily: 'Inter, sans-serif',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
