'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { authedFetch } from '@/lib/swr-fetchers'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'

/** Contrat événement attendu par le moteur (cf. src/lib/poster/contract.js). */
export interface PosterEvent {
  titre?: string; description?: string
  date_debut?: string | null; date_fin?: string | null; heure?: string | null
  prix?: string | null; contact?: string | null; organisateurs?: string | null
  lieu_nom?: string | null; adresse?: string | null; commune?: string | null
  categorie?: string; categorie_label?: string; categorie_emoji?: string; categorie_couleur?: string
  etablissement?: { id: string; nom?: string; photo_url?: string | null } | null
}

const FORMATS = [
  { key: 'a4-print',       label: 'A4' },
  { key: 'social-story',   label: '9:16' },
  { key: 'square',         label: 'Carré' },
  { key: 'facebook-cover', label: 'Couv. FB' },
]
const TEMPLATES = [
  { key: 'magazine',   label: 'Magazine', needsPhoto: false },
  { key: 'bloc',       label: 'Blocs',    needsPhoto: true },
  { key: 'grandeDate', label: 'Grande date', needsPhoto: true },
]

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

export default function PosterGeneratorModal({ event, onClose, onApply }: {
  event: PosterEvent
  onClose: () => void
  onApply: (publicUrl: string) => void
}) {
  const [format, setFormat]     = useState('a4-print')
  const [template, setTemplate] = useState('magazine')
  const [useBackgrounds, setUseBackgrounds] = useState(false)
  const [photo, setPhoto]       = useState<string | null>(null)   // dataURL
  const [logo, setLogo]         = useState<string | null>(null)   // dataURL
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob]         = useState<Blob | null>(null)
  const [loading, setLoading]   = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const logoRef  = useRef<HTMLInputElement>(null)

  const hasPhoto = !!(photo || event.etablissement?.photo_url)

  const generate = useCallback(async (random: boolean) => {
    setLoading(true); setError(null)
    try {
      const res = await authedFetch('/api/poster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          opts: { template, format, random, useBackgrounds, image: photo, logo },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erreur ${res.status}`)
      }
      const b = await res.blob()
      setBlob(b)
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [event, template, format, useBackgrounds, photo, logo])

  // Première proposition au montage + à chaque changement de format.
  useEffect(() => { generate(false) }, [format]) // eslint-disable-line react-hooks/exhaustive-deps
  // Nettoyage de l'objectURL
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    if (!blob) return
    setApplying(true); setError(null)
    try {
      const compressed = await compressImage(blob, { maxDim: 1600, quality: 0.88 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'event-image' })
      onApply(publicUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur upload')
      setApplying(false)
    }
  }

  const handleFile = async (f: File | undefined, set: (s: string) => void) => {
    if (!f) return
    set(await fileToDataUrl(f))
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#1A1209', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>← Annuler</button>
        <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 800 }}>Générer une affiche</p>
        <div style={{ width: 60 }} />
      </div>

      {/* Preview */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
        ) : previewUrl ? (
          <img src={previewUrl} alt="aperçu" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Aucun aperçu</p>
        )}
      </div>

      {error && <p style={{ margin: 0, padding: '0 16px 8px', color: '#FF9B7A', fontSize: 12, textAlign: 'center' }}>{error}</p>}

      {/* Panneau de contrôles */}
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', maxHeight: '46dvh', overflowY: 'auto' }}>
        {/* Aléatoire */}
        <button onClick={() => generate(true)} disabled={loading}
          style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: 'linear-gradient(90deg,#2D5A3D,#3A7A52)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, marginBottom: 14, fontFamily: 'Inter, sans-serif' }}>
          🎲 Générer aléatoire
        </button>

        <Group label="Format">
          {FORMATS.map(f => (
            <Chip key={f.key} active={format === f.key} onClick={() => setFormat(f.key)}>{f.label}</Chip>
          ))}
        </Group>

        <Group label="Style">
          {TEMPLATES.map(t => {
            const disabled = t.needsPhoto && !hasPhoto
            return (
              <Chip key={t.key} active={template === t.key} disabled={disabled}
                onClick={() => { if (!disabled) { setTemplate(t.key); generate(false) } }}>
                {t.label}{disabled ? ' · photo requise' : ''}
              </Chip>
            )
          })}
        </Group>

        <Group label="Éléments">
          <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0], setPhoto)} />
          <input ref={logoRef}  type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0], setLogo)} />
          <Chip active={!!photo} onClick={() => photoRef.current?.click()}>{photo ? '✓ Photo' : '+ Photo'}</Chip>
          <Chip active={!!logo}  onClick={() => logoRef.current?.click()}>{logo ? '✓ Logo' : '+ Logo'}</Chip>
          <Chip active={useBackgrounds} onClick={() => setUseBackgrounds(v => !v)}>{useBackgrounds ? '✓ Mes fonds' : 'Mes fonds'}</Chip>
        </Group>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={() => generate(false)} disabled={loading}
            style={{ flex: 1, padding: '13px', borderRadius: 14, border: '1.5px solid #2D5A3D', background: '#fff', color: '#2D5A3D', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Regénérer
          </button>
          <button onClick={apply} disabled={!blob || loading || applying}
            style={{ flex: 1.4, padding: '13px', borderRadius: 14, border: 'none', background: '#2D5A3D', color: '#fff', fontSize: 14, fontWeight: 800, cursor: (!blob || applying) ? 'default' : 'pointer', opacity: (!blob || applying) ? 0.6 : 1, fontFamily: 'Inter, sans-serif' }}>
            {applying ? 'Application…' : 'Utiliser cette affiche'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: '0 0 7px', fontSize: 10.5, fontWeight: 800, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Chip({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '8px 13px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: 'Inter, sans-serif',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: active ? '1.5px solid #2D5A3D' : '1.5px solid #E0D8CE',
        background: active ? '#E8F2EB' : '#fff',
        color: disabled ? '#C8BCA8' : active ? '#2D5A3D' : '#5A4A3A',
      }}>
      {children}
    </button>
  )
}
