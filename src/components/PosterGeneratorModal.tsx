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

/** Paramètres de génération, conservés pour reproduire l'affiche en plusieurs formats (export réseaux). */
export interface PosterParams {
  template: string
  bgIndex: number
  accent: string | null
  solidColor: string
  solidBg: boolean
  photo: string | null
  logo: string | null
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
// Pilotage du hasard côté client (le serveur est déterministe).
const BG_POOL = 8   // nb de fonds d'ambiance (1 par catégorie)
const SOLIDS  = ['#0E0E12', '#1B1C2B', '#241046', '#13212B', '#2D5A3D', '#3A1410', '#101A22', '#1A1209']
const ACCENTS = ['#E74C3C', '#9B59B6', '#27AE60', '#F39C12', '#3498DB', '#E91E63', '#16A085', '#2D5A3D', '#C4622D']
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

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
  onApply: (publicUrl: string, params: PosterParams) => void
}) {
  // Snapshot de l'event au montage (les champs sont figés quand le modal s'ouvre).
  const eventRef = useRef(event)

  const [format, setFormat]     = useState('a4-print')
  const [template, setTemplate] = useState('magazine')
  const [solidBg, setSolidBg]   = useState(false)
  const [photo, setPhoto]       = useState<string | null>(null)   // dataURL
  const [logo, setLogo]         = useState<string | null>(null)   // dataURL
  // Paramètres de hasard STABLES (re-tirés seulement via "Générer aléatoire")
  const [bgIndex, setBgIndex]       = useState(() => Math.floor(Math.random() * BG_POOL))
  const [accent, setAccent]         = useState<string | null>(null)
  const [solidColor, setSolidColor] = useState(() => pick(SOLIDS))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob]         = useState<Blob | null>(null)
  const [loading, setLoading]   = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const logoRef  = useRef<HTMLInputElement>(null)
  const reqId    = useRef(0)   // ignore les réponses périmées

  const generate = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true); setError(null)
    try {
      const res = await authedFetch('/api/poster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: eventRef.current,
          opts: { template, format, solidBg, image: photo, logo, bgIndex, accent, solidColor },
        }),
      })
      if (id !== reqId.current) return            // une requête plus récente a pris le relais
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erreur ${res.status}`)
      }
      const b = await res.blob()
      if (id !== reqId.current) return
      setBlob(b)
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b) })
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [template, format, solidBg, photo, logo, bgIndex, accent, solidColor])

  // Régénère AUTOMATIQUEMENT à chaque changement de paramètre (format, style,
  // fond, photo, logo, ou tirage aléatoire) + au montage. En gardant les
  // paramètres de hasard inchangés → l'image reste stable, seul le param
  // modifié change.
  useEffect(() => { generate() }, [generate])

  // "Générer aléatoire" : re-tire template + fond + couleur.
  const randomize = () => {
    setTemplate(pick(['magazine', 'bloc', 'grandeDate']))
    setBgIndex(Math.floor(Math.random() * BG_POOL))
    setAccent(Math.random() < 0.6 ? pick(ACCENTS) : null)
    setSolidColor(pick(SOLIDS))
  }
  // Nettoyage de l'objectURL au démontage
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    if (!blob) return
    setApplying(true); setError(null)
    try {
      const compressed = await compressImage(blob, { maxDim: 1600, quality: 0.88 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'event-image' })
      onApply(publicUrl, { template, bgIndex, accent, solidColor, solidBg, photo, logo })
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#1A1209', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body), sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>← Annuler</button>
        <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 800 }}>Générer une affiche</p>
        <div style={{ width: 60 }} />
      </div>

      {/* Preview */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden', position: 'relative' }}>
        {previewUrl && (
          <img src={previewUrl} alt="aperçu" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', opacity: loading ? 0.4 : 1, transition: 'opacity 0.2s' }} />
        )}
        {loading && (
          <div style={{ position: 'absolute', width: 36, height: 36, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
        )}
        {!previewUrl && !loading && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Aucun aperçu</p>}
      </div>

      {error && <p style={{ margin: 0, padding: '0 16px 8px', color: '#FF9B7A', fontSize: 12, textAlign: 'center' }}>{error}</p>}

      {/* Panneau de contrôles */}
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', maxHeight: '48dvh', overflowY: 'auto' }}>
        <button onClick={randomize} disabled={loading}
          style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: 'linear-gradient(90deg,#2D5A3D,#3A7A52)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, marginBottom: 14, fontFamily: 'var(--font-body), sans-serif' }}>
          🎲 Générer aléatoire
        </button>

        <Group label="Format">
          {FORMATS.map(f => (
            <Chip key={f.key} active={format === f.key} onClick={() => setFormat(f.key)}>{f.label}</Chip>
          ))}
        </Group>

        <Group label="Style">
          {TEMPLATES.map(t => (
            <Chip key={t.key} active={template === t.key} onClick={() => setTemplate(t.key)}>
              {t.label}
            </Chip>
          ))}
        </Group>

        <Group label="Fond">
          <Chip active={!solidBg} onClick={() => setSolidBg(false)}>Ambiance</Chip>
          <Chip active={solidBg} onClick={() => setSolidBg(true)}>Fond uni</Chip>
        </Group>

        <Group label="Éléments">
          <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0], setPhoto)} />
          <input ref={logoRef}  type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0], setLogo)} />
          {photo
            ? <Chip active onClick={() => { setPhoto(null); if (photoRef.current) photoRef.current.value = '' }}>Photo ✕</Chip>
            : <Chip onClick={() => photoRef.current?.click()}>+ Photo</Chip>}
          {logo
            ? <Chip active onClick={() => { setLogo(null); if (logoRef.current) logoRef.current.value = '' }}>Logo ✕</Chip>
            : <Chip onClick={() => logoRef.current?.click()}>+ Logo</Chip>}
        </Group>

        <button onClick={apply} disabled={!blob || loading || applying}
          style={{ width: '100%', marginTop: 6, padding: '14px', borderRadius: 14, border: 'none', background: '#2D5A3D', color: '#fff', fontSize: 14, fontWeight: 800, cursor: (!blob || applying) ? 'default' : 'pointer', opacity: (!blob || applying || loading) ? 0.6 : 1, fontFamily: 'var(--font-body), sans-serif' }}>
          {applying ? 'Application…' : 'Utiliser cette affiche'}
        </button>
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
        padding: '8px 13px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-body), sans-serif',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: active ? '1.5px solid #2D5A3D' : '1.5px solid #E0D8CE',
        background: active ? '#E8F2EB' : '#fff',
        color: disabled ? '#C8BCA8' : active ? '#2D5A3D' : '#5A4A3A',
      }}>
      {children}
    </button>
  )
}
