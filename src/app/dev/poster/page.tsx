'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * OUTIL LOCAL de prototypage d'affiches (dev only, servi par `npm run dev`).
 * → http://localhost:3000/dev/poster
 * Réutilise le moteur Satori de l'app via /api/dev/poster. Aucun coût, aucune IA.
 */

type Cat = { key: string; label: string; emoji: string; color: string }
type Config = { templates: string[]; formats: string[]; backgrounds: string[]; categories: Cat[] }

const FORMAT_LABELS: Record<string, string> = {
  'social-portrait': 'Portrait 1080×1350',
  'social-story': 'Story 1080×1920',
  'square': 'Carré 1080×1080',
  'a4-print': 'A4 impression',
  'facebook-cover': 'Bannière FB 1920×1005',
}
const TEMPLATE_LABELS: Record<string, string> = { magazine: 'Magazine', bloc: 'Bloc', grandeDate: 'Grande date' }

const EMPTY = {
  titre: '', description: '', date_debut: '', date_fin: '', heure: '',
  lieu_nom: '', commune: '', adresse: '', prix: '', categorie: 'autre',
  categorie_label: 'Autre', categorie_emoji: '📌', categorie_couleur: '#95A5A6',
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
}

export default function DevPosterPage() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [events, setEvents] = useState<{ id: string; titre: string; date_debut: string | null; statut?: string }[]>([])
  const [eventId, setEventId] = useState('')
  const [ev, setEv] = useState({ ...EMPTY })
  const [template, setTemplate] = useState('magazine')
  const [format, setFormat] = useState('social-portrait')
  const [bgMode, setBgMode] = useState<'uni' | 'ambiance' | 'image'>('uni')
  const [solidColor, setSolidColor] = useState('#1B1C2B')
  const [bgName, setBgName] = useState('')
  const [accent, setAccent] = useState('#E74C3C')
  const [image, setImage] = useState<string | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const urlRef = useRef('')

  useEffect(() => {
    fetch('/api/dev/poster').then(r => r.json()).then((c: Config) => {
      setCfg(c)
      if (c.formats?.[0] && !c.formats.includes(format)) setFormat(c.formats[0])
      if (c.backgrounds?.[0]) setBgName(c.backgrounds[0])
    }).catch(() => setErr('Config indisponible (lance `npm run dev`)'))
    fetch('/api/dev/poster?list=1').then(r => r.json()).then(d => setEvents(d.events ?? [])).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvent = async (idArg?: string) => {
    const id = (idArg ?? eventId).trim()
    if (!id) return
    setErr(''); setEventId(id)
    try {
      const r = await fetch(`/api/dev/poster?eventId=${encodeURIComponent(id)}`)
      const d = await r.json()
      if (d.error) { setErr(d.error); return }
      setEv({ ...EMPTY, ...d.event })
      if (d.event.categorie_couleur) setAccent(d.event.categorie_couleur)
    } catch { setErr('Chargement échoué') }
  }

  const setCat = (key: string) => {
    const c = cfg?.categories.find(x => x.key === key)
    if (!c) return
    setEv(e => ({ ...e, categorie: c.key, categorie_label: c.label, categorie_emoji: c.emoji, categorie_couleur: c.color }))
    setAccent(c.color)
  }

  const onFile = async (f: File | undefined, set: (v: string | null) => void) => { if (f) set(await fileToDataUrl(f)) }

  const render = useCallback(async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/dev/poster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: ev, template, format, accent, bgMode, solidColor, bgName, image, logo }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`) }
      const blob = await r.blob()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = URL.createObjectURL(blob)
      setPreview(urlRef.current)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    setBusy(false)
  }, [ev, template, format, accent, bgMode, solidColor, bgName, image, logo])

  // Rendu LIVE : régénère automatiquement ~0,45s après la dernière modification.
  useEffect(() => {
    if (!cfg) return
    const t = setTimeout(() => { void render() }, 450)
    return () => clearTimeout(t)
  }, [render, cfg])

  // ── styles ──
  const L: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6E6256', margin: '10px 0 4px' }
  const I: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #E0D6C2', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #EFE7D6', borderRadius: 12, padding: 14, marginBottom: 14 }
  const chip = (on: boolean): React.CSSProperties => ({ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${on ? '#C14A2B' : '#E0D6C2'}`, background: on ? '#C14A2B' : '#fff', color: on ? '#fff' : '#2E211A', fontSize: 13, fontWeight: 700, cursor: 'pointer' })

  return (
    <div style={{ minHeight: '100dvh', background: '#FBF1DD', color: '#2E211A', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 20, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Colonne contrôles ── */}
        <div>
          <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>🖼️ Générateur d&apos;affiche <span style={{ fontSize: 12, color: '#8A7D70' }}>(local)</span></h1>

          <div style={card}>
            <span style={L}>Charger un événement</span>
            <select style={I} value={eventId} onChange={e => loadEvent(e.target.value)}>
              <option value="">— choisir un événement ({events.length}) —</option>
              {events.map(x => <option key={x.id} value={x.id}>{(x.date_debut ? x.date_debut + ' · ' : '') + (x.titre || '(sans titre)')}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input style={I} value={eventId} onChange={e => setEventId(e.target.value)} placeholder="…ou coller un ID" />
              <button onClick={() => loadEvent()} style={{ background: '#3E7A52', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Charger</button>
            </div>

            <span style={L}>Titre</span>
            <input style={I} value={ev.titre} onChange={e => setEv({ ...ev, titre: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><span style={L}>Date</span><input style={I} value={ev.date_debut} onChange={e => setEv({ ...ev, date_debut: e.target.value })} placeholder="2026-07-12" /></div>
              <div style={{ width: 90 }}><span style={L}>Heure</span><input style={I} value={ev.heure} onChange={e => setEv({ ...ev, heure: e.target.value })} placeholder="20:00" /></div>
            </div>
            <span style={L}>Lieu</span>
            <input style={I} value={ev.lieu_nom} onChange={e => setEv({ ...ev, lieu_nom: e.target.value })} placeholder="Salle / lieu" />
            <span style={L}>Commune</span>
            <input style={I} value={ev.commune} onChange={e => setEv({ ...ev, commune: e.target.value })} />
            <span style={L}>Prix</span>
            <input style={I} value={ev.prix} onChange={e => setEv({ ...ev, prix: e.target.value })} placeholder="Gratuit, 10€…" />
            <span style={L}>Description</span>
            <textarea style={{ ...I, minHeight: 54, resize: 'vertical' }} value={ev.description} onChange={e => setEv({ ...ev, description: e.target.value })} />
            <span style={L}>Catégorie</span>
            <select style={I} value={ev.categorie} onChange={e => setCat(e.target.value)}>
              {cfg?.categories.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
          </div>

          <div style={card}>
            <span style={L}>Template</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {cfg?.templates.map(t => <button key={t} onClick={() => setTemplate(t)} style={chip(template === t)}>{TEMPLATE_LABELS[t] || t}</button>)}
            </div>

            <span style={L}>Format</span>
            <select style={I} value={format} onChange={e => setFormat(e.target.value)}>
              {cfg?.formats.map(f => <option key={f} value={f}>{FORMAT_LABELS[f] || f}</option>)}
            </select>

            <span style={L}>Couleur d&apos;accent</span>
            <input type="color" value={accent} onChange={e => setAccent(e.target.value)} style={{ ...I, height: 38, padding: 4 }} />
          </div>

          <div style={card}>
            <span style={L}>Fond</span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {(['uni', 'ambiance', 'image'] as const).map(m => <button key={m} onClick={() => setBgMode(m)} style={chip(bgMode === m)}>{m === 'uni' ? 'Uni' : m === 'ambiance' ? 'Ambiance' : 'Mon image'}</button>)}
            </div>
            {bgMode === 'uni' && <input type="color" value={solidColor} onChange={e => setSolidColor(e.target.value)} style={{ ...I, height: 38, padding: 4 }} />}
            {bgMode === 'ambiance' && (
              <select style={I} value={bgName} onChange={e => setBgName(e.target.value)}>
                {cfg?.backgrounds.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            {bgMode === 'image' && (
              <>
                <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0], setImage)} style={{ fontSize: 12 }} />
                {image && <div style={{ fontSize: 11, color: '#3E7A52', marginTop: 4 }}>✓ image chargée</div>}
              </>
            )}

            <span style={L}>Logo (optionnel)</span>
            <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0], setLogo)} style={{ fontSize: 12 }} />
            {logo && <div style={{ fontSize: 11, color: '#3E7A52', marginTop: 4 }}>✓ logo chargé</div>}
          </div>

          <button onClick={() => render()} disabled={busy} style={{ width: '100%', padding: 13, background: '#C14A2B', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Rendu…' : '↻ Rafraîchir l\'aperçu'}
          </button>
          <div style={{ fontSize: 11, color: '#8A7D70', marginTop: 6, textAlign: 'center' }}>Aperçu mis à jour automatiquement à chaque modification.</div>
          {err && <div style={{ color: '#B53A22', fontSize: 13, marginTop: 8 }}>⚠ {err}</div>}
        </div>

        {/* ── Colonne aperçu ── */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div style={{ ...card, minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {preview
              ? <img src={preview} alt="aperçu" style={{ maxWidth: '100%', maxHeight: '78dvh', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.15)' }} />
              : <span style={{ color: '#8A7D70', fontSize: 14 }}>L&apos;aperçu s&apos;affichera ici après « Générer ».</span>}
          </div>
          {preview && <a href={preview} download={`affiche-${template}.png`} style={{ display: 'inline-block', padding: '10px 16px', background: '#3E7A52', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>⬇ Télécharger</a>}
        </div>
      </div>
    </div>
  )
}
