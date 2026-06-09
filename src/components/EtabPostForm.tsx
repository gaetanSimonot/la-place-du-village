'use client'
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'

/**
 * Formulaire de création d'une actu / autre publication sur une fiche
 * établissement. Calqué sur PromotionForm. Owner-only (l'API revérifie).
 */
export default function EtabPostForm({ etablissementId, etablissementPhotos = [], type, onClose, onSaved }: {
  etablissementId: string
  etablissementPhotos?: string[]
  type: 'actu' | 'autre'
  onClose: () => void
  onSaved: () => void
}) {
  const [titre, setTitre]       = useState('')
  const [contenu, setContenu]   = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAutre = type === 'autre'

  const handleUpload = async (file: File) => {
    setUploading(true); setError(null)
    try {
      const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'admin-edit' })
      setImageUrl(publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload')
    }
    setUploading(false)
  }

  const save = async () => {
    if (!contenu.trim()) return
    setSaving(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const r = await fetch('/api/etablissement-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        etablissement_id: etablissementId,
        type,
        titre: titre.trim() || null,
        contenu: contenu.trim(),
        image_url: imageUrl || null,
      }),
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
            {isAutre ? 'Nouvelle publication' : 'Nouvelle actu'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Titre (facultatif)">
            <input
              type="text" value={titre} onChange={e => setTitre(e.target.value)}
              placeholder={isAutre ? 'ex: Nouveau menu, nouveau service…' : 'ex: Fermeture exceptionnelle'}
              style={inp} maxLength={120}
            />
          </Field>

          <Field label={isAutre ? 'Votre message (menu, service, info…)' : 'Votre actu'}>
            <textarea
              value={contenu} onChange={e => setContenu(e.target.value)}
              placeholder="Décrivez votre actualité…"
              rows={4} style={{ ...inp, resize: 'none', lineHeight: 1.4 }}
              maxLength={2000}
            />
            <p style={{ fontSize: 10, color: '#B0A898', margin: '4px 0 0', textAlign: 'right' }}>{contenu.length}/2000</p>
          </Field>

          <Field label="Image (facultatif)">
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
                  <input ref={fileRef} type="file" accept="image/*"
                    onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                    style={{ display: 'none' }} />
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
                        <button key={i} type="button" onClick={() => setImageUrl(url)}
                          style={{ flexShrink: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, overflow: 'hidden' }}
                          aria-label={`Photo ${i + 1}`}>
                          <img src={url} alt={`photo ${i + 1}`}
                            style={{ width: 56, height: 56, objectFit: 'cover', display: 'block', borderRadius: 8, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Field>

          {error && <p style={{ fontSize: 12, color: '#E53935', margin: '4px 0 0' }}>{error}</p>}

          <button onClick={save} disabled={saving || !contenu.trim()}
            style={{
              marginTop: 8, width: '100%', padding: '14px',
              backgroundColor: '#2D5A3D', color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 14, fontWeight: 700,
              cursor: saving || !contenu.trim() ? 'default' : 'pointer',
              opacity: saving || !contenu.trim() ? 0.5 : 1, fontFamily: 'Inter, sans-serif',
            }}>
            {saving ? 'Publication…' : 'Publier'}
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
