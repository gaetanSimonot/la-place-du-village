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

export interface PosterParams {
  template: string
  bgIndex: number
  accent: string | null
  solidColor: string
  solidBg: boolean
  photo: string | null
  logo: string | null
}

type BgMode = 'ambiance' | 'image' | 'uni'

const FORMATS = [
  { key: 'a4-print',       label: 'A4' },
  { key: 'social-story',   label: '9:16' },
  { key: 'square',         label: 'Carré' },
  { key: 'facebook-cover', label: 'Couv. FB' },
]
const TEMPLATES = [
  { key: 'magazine',   label: 'Magazine' },
  { key: 'bloc',       label: 'Blocs' },
  { key: 'grandeDate', label: 'Grande date' },
]
const TEMPLATE_KEYS = TEMPLATES.map(t => t.key)
const BG_POOL = 8   // nb de fonds d'ambiance (cf. /api/poster/bg)
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
  const eventRef = useRef(event)   // champs non éditables (catégorie, établissement…)

  // ── Textes ÉDITABLES (préremplis depuis l'event) ──
  const [titre, setTitre]             = useState(event.titre ?? '')
  const [dateDebut, setDateDebut]     = useState(event.date_debut ?? '')
  const [heure, setHeure]             = useState(event.heure ?? '')
  const [lieuNom, setLieuNom]         = useState(event.lieu_nom ?? '')
  const [commune, setCommune]         = useState(event.commune ?? '')
  const [prix, setPrix]               = useState(event.prix ?? '')
  const [description, setDescription] = useState(event.description ?? '')
  const [showTexts, setShowTexts]     = useState(false)

  // ── Choix ──
  const [format, setFormat]     = useState('a4-print')
  const [template, setTemplate] = useState('magazine')
  const [bgMode, setBgMode]     = useState<BgMode>('ambiance')
  const [bgIndex, setBgIndex]       = useState(() => Math.floor(Math.random() * BG_POOL))
  const [solidColor, setSolidColor] = useState(() => pick(SOLIDS))
  const [photo, setPhoto]       = useState<string | null>(null)
  const [logo, setLogo]         = useState<string | null>(null)
  const [accent, setAccent]     = useState<string | null>(null)

  // ── Cadenas « figer » (l'aléatoire ne touche pas ce qui est figé) ──
  const [lockStyle, setLockStyle] = useState(false)
  const [lockFond, setLockFond]   = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob]         = useState<Blob | null>(null)
  const [loading, setLoading]   = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const logoRef  = useRef<HTMLInputElement>(null)
  const reqId    = useRef(0)

  const generate = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true); setError(null)
    const opts: Record<string, unknown> = { template, format, logo, accent }
    if (bgMode === 'image') { opts.image = photo }
    else if (bgMode === 'uni') { opts.solidBg = true; opts.solidColor = solidColor }
    else { opts.bgIndex = bgIndex }   // ambiance
    try {
      const res = await authedFetch('/api/poster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            ...eventRef.current,
            titre, description,
            date_debut: dateDebut || null, heure: heure || null,
            lieu_nom: lieuNom || null, commune: commune || null, prix: prix || null,
          },
          opts,
        }),
      })
      if (id !== reqId.current) return
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Erreur ${res.status}`) }
      const b = await res.blob()
      if (id !== reqId.current) return
      setBlob(b)
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b) })
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [template, format, bgMode, bgIndex, solidColor, photo, logo, accent, titre, description, dateDebut, heure, lieuNom, commune, prix])

  // Régénère automatiquement (débounce) à chaque changement.
  useEffect(() => { const t = setTimeout(() => { generate() }, 450); return () => clearTimeout(t) }, [generate])

  // 🎲 Aléatoire : ne touche QUE ce qui n'est pas figé. Ne change jamais format,
  // textes, ni le mode de fond (ni l'image chargée).
  const randomize = () => {
    if (!lockStyle) { setTemplate(pick(TEMPLATE_KEYS)); setAccent(Math.random() < 0.6 ? pick(ACCENTS) : null) }
    if (!lockFond) {
      if (bgMode === 'ambiance') setBgIndex(Math.floor(Math.random() * BG_POOL))
      else if (bgMode === 'uni') setSolidColor(pick(SOLIDS))
      // image → jamais changée
    }
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    if (!blob) return
    setApplying(true); setError(null)
    try {
      const compressed = await compressImage(blob, { maxDim: 1600, quality: 0.88 })
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'event-image' })
      onApply(publicUrl, { template, bgIndex, accent, solidColor, solidBg: bgMode === 'uni', photo: bgMode === 'image' ? photo : null, logo })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur upload')
      setApplying(false)
    }
  }

  const handleFile = async (f: File | undefined, set: (s: string) => void) => { if (f) set(await fileToDataUrl(f)) }

  if (typeof document === 'undefined') return null

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1.5px solid #E0D8CE', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body), sans-serif' }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#1A1209', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body), sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>← Annuler</button>
        <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 800 }}>Générer une affiche</p>
        <div style={{ width: 60 }} />
      </div>

      {/* Aperçu */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden', position: 'relative' }}>
        {previewUrl && (
          <img src={previewUrl} alt="aperçu" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', opacity: loading ? 0.4 : 1, transition: 'opacity 0.2s' }} />
        )}
        {loading && <div style={{ position: 'absolute', width: 36, height: 36, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />}
        {!previewUrl && !loading && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Aucun aperçu</p>}
      </div>

      {error && <p style={{ margin: 0, padding: '0 16px 8px', color: '#FF9B7A', fontSize: 12, textAlign: 'center' }}>{error}</p>}

      {/* Contrôles */}
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', maxHeight: '52dvh', overflowY: 'auto' }}>
        <button onClick={randomize} disabled={loading}
          style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: 'linear-gradient(90deg,#2D5A3D,#3A7A52)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, marginBottom: 14, fontFamily: 'var(--font-body), sans-serif' }}>
          🎲 Aléatoire {(lockStyle || lockFond) ? '(respecte les 🔒)' : ''}
        </button>

        {/* Textes éditables */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowTexts(s => !s)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ✎ Textes de l&apos;affiche {showTexts ? '▲' : '▼'}
          </button>
          {showTexts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
              <input style={inputStyle} value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre" />
              <div style={{ display: 'flex', gap: 7 }}>
                <input style={inputStyle} value={dateDebut} onChange={e => setDateDebut(e.target.value)} placeholder="2026-07-12" />
                <input style={{ ...inputStyle, width: 90 }} value={heure} onChange={e => setHeure(e.target.value)} placeholder="20:00" />
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input style={inputStyle} value={lieuNom} onChange={e => setLieuNom(e.target.value)} placeholder="Lieu" />
                <input style={inputStyle} value={commune} onChange={e => setCommune(e.target.value)} placeholder="Commune" />
              </div>
              <input style={inputStyle} value={prix} onChange={e => setPrix(e.target.value)} placeholder="Prix (Gratuit, 10€…)" />
              <textarea style={{ ...inputStyle, minHeight: 46, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
            </div>
          )}
        </div>

        <Group label="Format">
          {FORMATS.map(f => <Chip key={f.key} active={format === f.key} onClick={() => setFormat(f.key)}>{f.label}</Chip>)}
        </Group>

        <Group label="Style" right={<LockBtn locked={lockStyle} onToggle={() => setLockStyle(v => !v)} />}>
          {TEMPLATES.map(t => <Chip key={t.key} active={template === t.key} onClick={() => setTemplate(t.key)}>{t.label}</Chip>)}
        </Group>

        <Group label="Fond" right={<LockBtn locked={lockFond} onToggle={() => setLockFond(v => !v)} />}>
          <Chip active={bgMode === 'ambiance'} onClick={() => setBgMode('ambiance')}>Ambiance</Chip>
          <Chip active={bgMode === 'image'} onClick={() => setBgMode('image')}>Image</Chip>
          <Chip active={bgMode === 'uni'} onClick={() => setBgMode('uni')}>Uni</Chip>
        </Group>

        {/* Détail du fond selon le mode */}
        {bgMode === 'ambiance' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, margin: '-4px 0 12px' }}>
            {Array.from({ length: BG_POOL }).map((_, n) => (
              <button key={n} onClick={() => setBgIndex(n)} style={{ padding: 0, border: bgIndex === n ? '2.5px solid #2D5A3D' : '2px solid #E0D8CE', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: '#EEE' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/poster/bg?i=${n}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
        )}
        {bgMode === 'image' && (
          <div style={{ margin: '-4px 0 12px' }}>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0], setPhoto)} />
            {photo
              ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                  <Chip active onClick={() => { setPhoto(null); if (photoRef.current) photoRef.current.value = '' }}>Retirer ✕</Chip>
                </div>
              : <Chip onClick={() => photoRef.current?.click()}>+ Charger une image</Chip>}
          </div>
        )}
        {bgMode === 'uni' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '-4px 0 12px' }}>
            {SOLIDS.map(c => <button key={c} onClick={() => setSolidColor(c)} aria-label={c} style={{ width: 30, height: 30, borderRadius: 8, background: c, border: solidColor === c ? '3px solid #2D5A3D' : '2px solid #E0D8CE', cursor: 'pointer' }} />)}
            <input type="color" value={solidColor} onChange={e => setSolidColor(e.target.value)} style={{ width: 40, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
          </div>
        )}

        <Group label="Logo">
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0], setLogo)} />
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

function Group({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 7px' }}>
        <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
        {right}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function LockBtn({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={locked ? 'Figé — l’aléatoire ne le change pas' : 'Non figé — l’aléatoire peut le changer'}
      style={{ marginLeft: 8, background: locked ? '#E8F2EB' : 'none', border: locked ? '1px solid #2D5A3D' : '1px solid transparent', borderRadius: 7, padding: '2px 7px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#2D5A3D', opacity: locked ? 1 : 0.55 }}>
      {locked ? '🔒 figé' : '🔓 figer'}
    </button>
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
