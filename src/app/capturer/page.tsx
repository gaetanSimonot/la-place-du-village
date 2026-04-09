'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'

function CropStep({ previewUrl, position, onChange, onConfirm }: {
  previewUrl: string
  position: string
  onChange: (pos: string) => void
  onConfirm: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{w: number; h: number} | null>(null)
  const [px, py] = position.split(' ').map(v => parseFloat(v))

  // Calcule les dimensions réelles de l'image rendue (object-fit: contain)
  // et la fenêtre de cadrage (proportions de la card : pleine largeur × 144px)
  function computeLayout(cW: number, cH: number, natW: number, natH: number) {
    const imgRatio = natW / natH
    const conRatio = cW / cH
    let rendW: number, rendH: number, offX: number, offY: number
    if (imgRatio > conRatio) {
      rendW = cW; rendH = cW / imgRatio; offX = 0; offY = (cH - rendH) / 2
    } else {
      rendH = cH; rendW = cH * imgRatio; offX = (cW - rendW) / 2; offY = 0
    }
    // La card fait pleine largeur × 144px avec object-fit: cover
    const phoneW = window.innerWidth
    const CARD_H = 144
    const coverScale = Math.max(phoneW / natW, CARD_H / natH)
    const rendScale = rendW / natW
    const cropW = Math.min(rendW, (phoneW / coverScale) * rendScale)
    const cropH = Math.min(rendH, (CARD_H / coverScale) * rendScale)
    return { rendW, rendH, offX, offY, cropW, cropH }
  }

  // Rectangle de cadrage positionné selon px/py
  const layout = (() => {
    const c = containerRef.current
    if (!c || !natural) return null
    const { width: cW, height: cH } = c.getBoundingClientRect()
    const l = computeLayout(cW, cH, natural.w, natural.h)
    return {
      ...l,
      cropLeft: l.offX + (l.rendW - l.cropW) * px / 100,
      cropTop:  l.offY + (l.rendH - l.cropH) * py / 100,
    }
  })()

  const handlePointer = (e: React.PointerEvent) => {
    const c = containerRef.current
    if (!c || !natural) return
    const rect = c.getBoundingClientRect()
    const l = computeLayout(rect.width, rect.height, natural.w, natural.h)
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left  - l.offX) / l.rendW))
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top   - l.offY) / l.rendH))
    onChange(`${Math.round(relX * 100)}% ${Math.round(relY * 100)}%`)
  }

  const DARK = 'rgba(0,0,0,0.62)'

  return (
    <div className="min-h-screen bg-black flex flex-col" style={{ userSelect: 'none' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top,0px),16px)', paddingBottom: 12 }}>
        <p className="text-white font-bold text-base">Choisir le cadrage</p>
        <button onClick={onConfirm}
          className="bg-[#C4622D] text-white px-5 py-2 rounded-xl font-bold text-sm active:opacity-75">
          Valider →
        </button>
      </div>

      {/* Zone image principale */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={e => { if (e.buttons > 0) handlePointer(e) }}
      >
        {/* Image entière visible */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          onLoad={e => {
            const img = e.target as HTMLImageElement
            setNatural({ w: img.naturalWidth, h: img.naturalHeight })
          }}
        />

        {/* 4 panneaux sombres autour de la fenêtre de cadrage */}
        {layout && (() => {
          const { cropLeft: cl, cropTop: ct, cropW: cw, cropH: ch } = layout
          return (
            <>
              <div className="absolute inset-x-0 pointer-events-none" style={{ top: 0, height: ct, background: DARK }} />
              <div className="absolute inset-x-0 pointer-events-none" style={{ top: ct + ch, bottom: 0, background: DARK }} />
              <div className="absolute pointer-events-none" style={{ top: ct, height: ch, left: 0, width: cl, background: DARK }} />
              <div className="absolute pointer-events-none" style={{ top: ct, height: ch, left: cl + cw, right: 0, background: DARK }} />

              {/* Fenêtre de cadrage : bordure + coins + grille des tiers */}
              <div className="absolute pointer-events-none"
                style={{ top: ct, left: cl, width: cw, height: ch, outline: '2px solid rgba(255,255,255,0.85)', outlineOffset: '-1px' }}>
                {/* Coins */}
                <div className="absolute -top-px -left-px  w-5 h-5 border-t-[3px] border-l-[3px] border-white" />
                <div className="absolute -top-px -right-px w-5 h-5 border-t-[3px] border-r-[3px] border-white" />
                <div className="absolute -bottom-px -left-px  w-5 h-5 border-b-[3px] border-l-[3px] border-white" />
                <div className="absolute -bottom-px -right-px w-5 h-5 border-b-[3px] border-r-[3px] border-white" />
                {/* Grille des tiers */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.18) 1px,transparent 1px)',
                  backgroundSize: '33.33% 33.33%',
                }} />
              </div>
            </>
          )
        })()}
      </div>

      {/* Mini-preview card + instruction */}
      <div className="flex-shrink-0 px-4 pt-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom,0px),16px)' }}>
        <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-2">Aperçu dans l&apos;app</p>
        <div className="w-full rounded-xl overflow-hidden shadow-xl" style={{ height: 72 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: position }} />
        </div>
        <p className="text-white/35 text-xs text-center mt-2">Appuie sur la photo pour déplacer la zone</p>
      </div>
    </div>
  )
}
import { CATEGORIES } from '@/lib/categories'
import { Categorie } from '@/lib/types'
import type { ExtractedData } from '@/lib/extract'
import MicButton from '@/components/MicButton'

interface FormData {
  titre: string
  description: string
  date_debut: string
  date_fin: string
  heure: string
  categorie: Categorie
  lieu_nom: string
  commune: string
  prix: string
  contact: string
  organisateurs: string
}

const emptyForm: FormData = {
  titre: '', description: '', date_debut: '', date_fin: '',
  heure: '', categorie: 'autre', lieu_nom: '', commune: '',
  prix: '', contact: '', organisateurs: '',
}

type Step = 'input' | 'crop' | 'selection' | 'preview' | 'success'

interface SubmitResult {
  titre: string
  ok: boolean
  statut?: string
}

// Compresse une image base64 à max 1200px / qualité 0.82
async function compressImage(base64: string, mimeType: string): Promise<{ data: string; mime: string }> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const MAX = 1200
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      resolve({ data: dataUrl.split(',')[1], mime: 'image/jpeg' })
    }
    img.src = `data:${mimeType};base64,${base64}`
  })
}

function extractToForm(e: ExtractedData): FormData {
  return {
    titre:         e.titre        ?? '',
    description:   e.description  ?? '',
    date_debut:    e.date_debut   ?? '',
    date_fin:      e.date_fin     ?? '',
    heure:         e.heure        ?? '',
    categorie:     (e.categorie   ?? 'autre') as Categorie,
    lieu_nom:      e.lieu_nom     ?? '',
    commune:       e.commune      ?? '',
    prix:          e.prix         ?? '',
    contact:       e.contact      ?? '',
    organisateurs: e.organisateurs ?? '',
  }
}

export default function CapturerPage() {
  const [step, setStep]               = useState<Step>('input')
  const [texte, setTexte]             = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMime, setImageMime]     = useState('image/jpeg')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState('50% 50%')

  // Multi-events
  const [events, setEvents]           = useState<ExtractedData[]>([])
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())

  // Single preview/edit
  const [form, setForm]               = useState<FormData>(emptyForm)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Batch submit state
  const [submitProgress, setSubmitProgress] = useState(0)
  const [submitResults, setSubmitResults]   = useState<SubmitResult[]>([])

  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const result   = reader.result as string
      const rawBase64 = result.split(',')[1]
      const mimeType  = file.type || 'image/jpeg'
      const compressed = await compressImage(rawBase64, mimeType)
      setImageBase64(compressed.data)
      setImageMime(compressed.mime)
      setImagePreview(`data:${compressed.mime};base64,${compressed.data}`)
      setImagePosition('50% 50%')
      setStep('crop')
    }
    reader.readAsDataURL(file)
  }

  const handleAnalyse = async () => {
    if (!imageBase64 && !texte.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/extract/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texte || null, image: imageBase64, imageMimeType: imageMime }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const raw: ExtractedData[] = data.events ?? []
      // Ne garder que les events valides avec titre + date + lieu minimum
      const evts = raw.filter(e =>
        e != null && e.titre?.trim() && e.date_debut && (e.lieu_nom?.trim() || e.commune?.trim())
      )
      setEvents(evts)
      setExpanded(new Set())

      if (evts.length === 1) {
        setForm(extractToForm(evts[0]))
        setStep('preview')
      } else if (evts.length === 0) {
        setError("Aucun événement complet détecté (titre + date + lieu requis)")
      } else {
        setSelected(new Set(evts.map((_, i) => i)))
        setStep('selection')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  // Soumission d'un seul événement (depuis preview)
  const handleSubmitSingle = async () => {
    if (!form.titre.trim()) { setError('Le titre est requis'); return }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/evenements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, image: imageBase64, imageMimeType: imageMime, image_position: imagePosition }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSubmitResults([{ titre: form.titre, ok: true, statut: data.statut }])
      setStep('success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  // Soumission groupée (depuis selection)
  const handleSubmitBatch = async () => {
    const toSubmit = Array.from(selected).map(i => events[i])
    if (toSubmit.length === 0) return
    setLoading(true)
    setError(null)
    setSubmitProgress(0)
    const results: SubmitResult[] = []
    for (let i = 0; i < toSubmit.length; i++) {
      const evt = toSubmit[i]
      try {
        const res  = await fetch('/api/evenements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...extractToForm(evt), image: i === 0 ? imageBase64 : null, imageMimeType: imageMime }),
        })
        const data = await res.json()
        results.push({ titre: evt.titre ?? '(sans titre)', ok: res.ok && !data.error, statut: data.statut })
      } catch {
        results.push({ titre: evt.titre ?? '(sans titre)', ok: false })
      }
      setSubmitProgress(i + 1)
    }
    setSubmitResults(results)
    setLoading(false)
    setStep('success')
  }

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(prev => prev.size === events.length ? new Set() : new Set(events.map((_, i) => i)))
  }

  const toggleExpand = (i: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const field = (label: string, key: keyof FormData, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]"
      />
    </div>
  )

  // ── Cadrage ──────────────────────────────────────────────────────────────────
  if (step === 'crop' && imagePreview) {
    return (
      <CropStep
        previewUrl={imagePreview}
        position={imagePosition}
        onChange={setImagePosition}
        onConfirm={() => setStep('input')}
      />
    )
  }

  // ── Succès ───────────────────────────────────────────────────────────────────
  if (step === 'success') {
    const ok  = submitResults.filter(r => r.ok).length
    const ko  = submitResults.filter(r => !r.ok).length
    return (
      <div className="min-h-screen bg-[#FBF7F0] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold text-[#2C1810] mb-1">Merci !</h2>
        <p className="text-gray-600 text-sm mb-6">
          {ok} événement{ok > 1 ? 's' : ''} soumis
          {ko > 0 ? `, ${ko} erreur${ko > 1 ? 's' : ''}` : ''}
        </p>

        {/* Détail des résultats */}
        {submitResults.length > 1 && (
          <div className="w-full max-w-xs bg-white rounded-2xl p-4 mb-6 text-left space-y-2">
            {submitResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-base">{r.ok ? '✅' : '❌'}</span>
                <span className="text-sm text-[#2C1810] leading-snug flex-1">{r.titre}</span>
                {r.statut && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    r.statut === 'publie' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {r.statut === 'publie' ? 'Publié' : 'À valider'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => { setStep('input'); setTexte(''); setForm(emptyForm); setImageBase64(null); setImagePreview(null); setEvents([]); setSelected(new Set()); setSubmitResults([]) }}
            className="py-3 rounded-2xl font-medium text-[#C4622D] border-2 border-[#C4622D]"
          >
            Ajouter d&apos;autres événements
          </button>
          <Link href="/" className="text-sm text-gray-400 underline text-center">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    )
  }

  // ── Sélection (multi-events) ──────────────────────────────────────────────────
  if (step === 'selection') {
    const cats = CATEGORIES as Record<string, { label: string; emoji: string; color: string }>
    return (
      <div className="min-h-screen bg-[#FBF7F0]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('input')} className="text-[#C4622D] font-bold text-2xl leading-none">←</button>
          <div className="flex-1">
            <h1 className="font-bold text-[#2C1810] leading-tight">{events.length} événement{events.length > 1 ? 's' : ''} détecté{events.length > 1 ? 's' : ''}</h1>
            <p className="text-xs text-gray-400">Sélectionne ceux à soumettre</p>
          </div>
          <button onClick={toggleAll} className="text-xs text-[#C4622D] font-semibold underline">
            {selected.size === events.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>

        <div className="p-3 space-y-2 pb-32">
          {imagePreview && (
            <div className="rounded-2xl overflow-hidden mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Aperçu" className="w-full max-h-40 object-cover" />
            </div>
          )}

          {events.map((evt, i) => {
            const cat    = cats[evt.categorie ?? 'autre'] ?? cats['autre']
            const isOn   = selected.has(i)
            const isOpen = expanded.has(i)
            return (
              <div
                key={i}
                className={`bg-white rounded-2xl border-2 transition-colors shadow-sm ${isOn ? 'border-[#C4622D]' : 'border-transparent'}`}
              >
                {/* Ligne principale — clic = sélectionner */}
                <div
                  onClick={() => toggleSelect(i)}
                  className="flex items-start gap-3 p-3 cursor-pointer"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isOn ? 'bg-[#C4622D] border-[#C4622D]' : 'border-[#E8E0D5]'}`}>
                    {isOn && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cat.color }}>
                        {cat.emoji} {cat.label}
                      </span>
                    </div>
                    <p className="font-semibold text-sm text-[#2C1810] leading-snug">{evt.titre}</p>
                    <div className="flex flex-wrap gap-x-3 mt-1">
                      <span className="text-xs text-[#C4622D] font-medium">
                        {new Date(evt.date_debut! + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        {evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}
                      </span>
                      <span className="text-xs text-gray-400">📍 {evt.lieu_nom ?? evt.commune}</span>
                    </div>
                  </div>
                  {/* Bouton déplier */}
                  <button
                    onClick={(e) => toggleExpand(i, e)}
                    className="text-gray-300 hover:text-gray-500 text-lg leading-none shrink-0 mt-0.5 transition-colors px-1"
                  >
                    {isOpen ? '▲' : '▼'}
                  </button>
                </div>

                {/* Détails dépliés */}
                {isOpen && (
                  <div className="px-4 pb-3 pt-0 border-t border-[#F5F1EC] space-y-1.5 text-xs text-gray-600">
                    {evt.date_fin && <p><span className="font-semibold text-gray-400">Fin :</span> {evt.date_fin}</p>}
                    {evt.description && <p className="leading-relaxed"><span className="font-semibold text-gray-400">Description :</span> {evt.description}</p>}
                    {evt.lieu_adresse && <p><span className="font-semibold text-gray-400">Adresse :</span> {evt.lieu_adresse}</p>}
                    {evt.commune && evt.lieu_nom && <p><span className="font-semibold text-gray-400">Commune :</span> {evt.commune}</p>}
                    {evt.prix && <p><span className="font-semibold text-gray-400">Prix :</span> {evt.prix}</p>}
                    {evt.contact && <p><span className="font-semibold text-gray-400">Contact :</span> {evt.contact}</p>}
                    {evt.organisateurs && <p><span className="font-semibold text-gray-400">Organisateurs :</span> {evt.organisateurs}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#E8E0D5]">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-full bg-[#E8E0D5] rounded-full h-2">
                <div
                  className="bg-[#C4622D] h-2 rounded-full transition-all"
                  style={{ width: `${selected.size ? (submitProgress / selected.size) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">{submitProgress} / {selected.size} envoyés…</p>
            </div>
          ) : (
            <button
              onClick={handleSubmitBatch}
              disabled={selected.size === 0}
              className="w-full bg-[#C4622D] text-white py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-opacity"
            >
              Soumettre {selected.size} événement{selected.size > 1 ? 's' : ''} →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Preview (1 event) ─────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="min-h-screen bg-[#FBF7F0]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('input')} className="text-[#C4622D] font-bold text-2xl leading-none">←</button>
          <h1 className="font-bold text-[#2C1810] flex-1">Vérifier l&apos;événement</h1>
        </div>

        <div className="p-4 space-y-3 pb-32">
          <p className="text-sm text-gray-500">L&apos;IA a rempli les champs — vérifie et corrige si besoin.</p>

          {imagePreview && (
            <div className="rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Aperçu" className="w-full max-h-48 object-cover" />
            </div>
          )}

          <div className="bg-white rounded-2xl p-4 space-y-3">
            {field('Titre *', 'titre', 'text', "Nom de l'événement")}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Catégorie</label>
              <select
                value={form.categorie}
                onChange={e => setForm(f => ({ ...f, categorie: e.target.value as Categorie }))}
                className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]"
              >
                {(Object.entries(CATEGORIES) as [Categorie, { label: string; emoji: string }][]).map(([key, cat]) => (
                  <option key={key} value={key}>{cat.emoji} {cat.label}</option>
                ))}
              </select>
            </div>
            {field('Description', 'description')}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date & Heure</p>
            {field('Date de début', 'date_debut', 'date')}
            {field('Date de fin', 'date_fin', 'date')}
            {field('Heure', 'heure', 'time')}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lieu</p>
            {field('Nom du lieu', 'lieu_nom', 'text', 'Salle des fêtes, Espace culturel...')}
            {field('Commune', 'commune', 'text', 'Ganges, Saint-Bauzille...')}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Infos pratiques</p>
            {field('Prix', 'prix', 'text', 'Gratuit, 5€, Sur réservation...')}
            {field('Contact', 'contact', 'text', 'Téléphone ou email')}
            {field('Organisateur(s)', 'organisateurs')}
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{error}</p>}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#E8E0D5]">
          <button
            onClick={handleSubmitSingle}
            disabled={loading}
            className="w-full bg-[#C4622D] text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Publication...' : "Publier l'événement"}
          </button>
        </div>
      </div>
    )
  }

  // ── Saisie ───────────────────────────────────────────────────────────────────
  const canAnalyse = !loading && (!!imageBase64 || texte.trim().length > 0)

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold text-[#2C1810] flex-1">Photo ou affiche</h1>
      </div>

      <div className="p-4 space-y-4 pb-32">

        {/* Zone photo */}
        <input ref={cameraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {imagePreview ? (
          <div className="relative rounded-2xl overflow-hidden bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Aperçu" className="w-full max-h-72 object-cover" style={{ objectPosition: imagePosition }} />
            <button
              onClick={() => { setImageBase64(null); setImagePreview(null) }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold"
            >
              ×
            </button>
            <button
              onClick={() => setStep('crop')}
              className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full"
            >
              Recadrer
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 space-y-3">
            <p className="text-sm font-semibold text-[#2C1810] text-center mb-1">Ajoute une photo 📷</p>
            <button
              onClick={() => cameraRef.current?.click()}
              className="w-full py-3 bg-[#C4622D] text-white rounded-xl font-semibold text-sm"
            >
              Prendre une photo
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="w-full py-3 border-2 border-[#E8E0D5] text-[#2C1810] rounded-xl font-semibold text-sm"
            >
              Choisir dans la galerie
            </button>
          </div>
        )}

        {/* Texte optionnel */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#2C1810]">
              Infos complémentaires <span className="text-gray-400 font-normal">(optionnel)</span>
            </p>
            <MicButton onTranscript={t => setTexte(prev => prev ? prev + ' ' + t : t)} />
          </div>
          <textarea
            value={texte}
            onChange={e => setTexte(e.target.value)}
            rows={4}
            placeholder="Date, lieu, prix, lien... tout ce qui peut aider l'IA à compléter la fiche"
            className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] resize-none focus:outline-none focus:border-[#C4622D]"
          />
        </div>

        {error && <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{error}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#E8E0D5]">
        <button
          onClick={handleAnalyse}
          disabled={!canAnalyse}
          className="w-full bg-[#C4622D] text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyse en cours...
            </span>
          ) : "Analyser avec l'IA →"}
        </button>
      </div>
    </div>
  )
}
