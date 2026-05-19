'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Categorie, Evenement } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'

type Mode = 'edit' | 'crop' | 'fullscreen'
interface Prediction { place_id: string; description: string; main: string; secondary: string }

// ── Autocomplete lieu ─────────────────────────────────────────────────────────
function LieuSearch({ onSelect }: {
  onSelect: (p: Prediction) => void
}) {
  const [query, setQuery]   = useState('')
  const [preds, setPreds]   = useState<Prediction[]>([])
  const [open, setOpen]     = useState(false)
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setPreds([]); setSearching(false); return }
    setSearching(true)
    const r = await fetch(`/api/admin/autocomplete?q=${encodeURIComponent(q)}`)
    const d = await r.json()
    setPreds(d.predictions ?? [])
    setOpen(true)
    setSearching(false)
  }, [])

  const handleChange = (v: string) => {
    setQuery(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 300)
  }

  const handleSelect = (p: Prediction) => {
    setQuery('')
    setPreds([])
    setOpen(false)
    onSelect(p)
  }

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        🔍 Rechercher un lieu ou une adresse
      </label>
      <input type="text" value={query} onChange={e => handleChange(e.target.value)}
        onFocus={() => preds.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Salle des fêtes, 12 rue de la Paix, Ganges…"
        className="w-full bg-white border border-[#C4622D] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D] placeholder-gray-400" />
      {searching && (
        <div className="absolute right-3 top-1/2 mt-3 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {open && preds.length > 0 && (
        <div className="absolute z-50 left-0 right-0 bg-white border border-[#E8E0D5] rounded-xl shadow-xl mt-1 overflow-hidden">
          {preds.map(p => (
            <button key={p.place_id} onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-3 hover:bg-[#FBF7F0] border-b border-[#F0EAE0] last:border-0 flex items-start gap-2">
              <span className="text-base shrink-0 mt-0.5">📍</span>
              <div>
                <p className="text-sm font-medium text-[#2C1810] leading-tight">{p.main}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.secondary}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Crop inline ───────────────────────────────────────────────────────────────
function CropStep({ src, position, onChange, onConfirm, onBack }: {
  src: string; position: string
  onChange: (p: string) => void; onConfirm: () => void; onBack: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [px, py] = position.split(' ').map(v => parseFloat(v))

  function computeLayout(cW: number, cH: number, nW: number, nH: number) {
    const ir = nW / nH, cr = cW / cH
    let rW: number, rH: number, oX: number, oY: number
    if (ir > cr) { rW = cW; rH = cW / ir; oX = 0; oY = (cH - rH) / 2 }
    else         { rH = cH; rW = cH * ir; oX = (cW - rW) / 2; oY = 0 }
    const pW = window.innerWidth, CH = 144
    const cs = Math.max(pW / nW, CH / nH), rs = rW / nW
    const cropW = Math.min(rW, (pW / cs) * rs)
    const cropH = Math.min(rH, (CH / cs) * rs)
    return { rW, rH, oX, oY, cropW, cropH }
  }

  const layout = (() => {
    const c = containerRef.current
    if (!c || !natural) return null
    const { width: cW, height: cH } = c.getBoundingClientRect()
    const l = computeLayout(cW, cH, natural.w, natural.h)
    return { ...l, cropLeft: l.oX + (l.rW - l.cropW) * px / 100, cropTop: l.oY + (l.rH - l.cropH) * py / 100 }
  })()

  const handlePointer = (e: React.PointerEvent) => {
    const c = containerRef.current
    if (!c || !natural) return
    const rect = c.getBoundingClientRect()
    const l = computeLayout(rect.width, rect.height, natural.w, natural.h)
    const rX = Math.max(0, Math.min(1, (e.clientX - rect.left - l.oX) / l.rW))
    const rY = Math.max(0, Math.min(1, (e.clientY - rect.top  - l.oY) / l.rH))
    onChange(`${Math.round(rX * 100)}% ${Math.round(rY * 100)}%`)
  }

  const D = 'rgba(0,0,0,0.62)'
  return (
    <div className="fixed inset-0 bg-black flex flex-col" style={{ userSelect: 'none', zIndex: 1100 }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={onBack} className="text-gray-400 text-sm">← Retour</button>
        <p className="text-white font-bold">Recadrer</p>
        <button onClick={onConfirm} className="bg-[#C4622D] text-white px-4 py-2 rounded-xl font-bold text-sm">Valider →</button>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={e => { if (e.buttons > 0) handlePointer(e) }}>
        <img src={src} alt="" className="w-full h-full object-contain select-none pointer-events-none"
          onLoad={e => { const i = e.currentTarget; setNatural({ w: i.naturalWidth, h: i.naturalHeight }) }} />
        {layout && (<>
          <div style={{ position: 'absolute', top: layout.oY, left: layout.oX, width: layout.rW, height: layout.rH, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: layout.cropLeft - layout.oX, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: layout.rW - (layout.cropLeft - layout.oX) - layout.cropW, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.cropTop - layout.oY, backgroundColor: D }} />
            <div style={{ position: 'absolute', bottom: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.rH - (layout.cropTop - layout.oY) - layout.cropH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: layout.cropTop - layout.oY, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.cropH, border: '2px solid #fff', borderRadius: 4 }} />
          </div>
        </>)}
      </div>
      <p className="text-gray-400 text-xs text-center py-3 shrink-0">Appuyez pour repositionner la vignette</p>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
interface InitialData {
  titre?: string; description?: string; date_debut?: string; date_fin?: string
  heure?: string; categorie?: Categorie; lieu_nom?: string; commune?: string
  prix?: string; contact?: string; organisateurs?: string
}
interface InitialImage { base64: string; mime: string; preview: string; position: string }

interface Props {
  evenementId?: string
  initialData?: InitialData
  initialImage?: InitialImage | null
  onClose: () => void
  onSaved?: (result?: { statut?: string; message?: string; id?: string }) => void
}

export default function EventEditDrawer({ evenementId, initialData, initialImage, onClose, onSaved }: Props) {
  const [mode, setMode]       = useState<Mode>('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [titre, setTitre]               = useState('')
  const [description, setDescription]   = useState('')
  const [dateDebut, setDateDebut]       = useState('')
  const [dateFin, setDateFin]           = useState('')
  const [heure, setHeure]               = useState('')
  const [categorie, setCategorie]       = useState<Categorie>('autre')
  const [prix, setPrix]                 = useState('')
  const [contact, setContact]           = useState('')
  const [organisateurs, setOrganisateurs] = useState('')
  const [statut, setStatut]             = useState('en_attente')

  const [lieuId, setLieuId]             = useState<string | null>(null)
  const [lieuNom, setLieuNom]           = useState('')
  const [commune, setCommune]           = useState('')
  const [adresse, setAdresse]           = useState('')
  const [lat, setLat]                   = useState('')
  const [lng, setLng]                   = useState('')
  const [placeIdGoogle, setPlaceIdGoogle] = useState<string | null>(null)

  const [promotion, setPromotion]         = useState<'basic' | 'pro' | 'max'>('basic')
  const [promoOrdre, setPromoOrdre]       = useState<string>('')

  const [imageUrl, setImageUrl]           = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState('50% 50%')
  const [newBase64, setNewBase64]         = useState<string | null>(null)
  const [newMime, setNewMime]             = useState('image/jpeg')
  const [newPreview, setNewPreview]       = useState<string | null>(null)
  // V3: track si l'image vient d'une extraction (pour badge "EXTRAIT DE L'AFFICHE")
  const [imageFromExtract, setImageFromExtract] = useState(false)
  const [pexelsLoading, setPexelsLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!evenementId) {
      // Mode création : hydrate depuis initialData
      if (initialData) {
        setTitre(initialData.titre ?? '')
        setDescription(initialData.description ?? '')
        setDateDebut(initialData.date_debut ?? '')
        setDateFin(initialData.date_fin ?? '')
        setHeure(initialData.heure?.slice(0, 5) ?? '')
        setCategorie(initialData.categorie ?? 'autre')
        setPrix(initialData.prix ?? '')
        setContact(initialData.contact ?? '')
        setOrganisateurs(initialData.organisateurs ?? '')
        setLieuNom(initialData.lieu_nom ?? '')
        setCommune(initialData.commune ?? '')
      }
      if (initialImage) {
        setNewBase64(initialImage.base64)
        setNewMime(initialImage.mime)
        setNewPreview(initialImage.preview)
        setImagePosition(initialImage.position)
        setImageFromExtract(true)
      }
      setLoading(false)
      return
    }
    supabase.from('evenements').select('*, lieux(*)').eq('id', evenementId).single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        const e = data as Evenement
        setTitre(e.titre ?? '')
        setDescription(e.description ?? '')
        setDateDebut(e.date_debut ?? '')
        setDateFin(e.date_fin ?? '')
        setHeure(e.heure?.slice(0, 5) ?? '')
        setCategorie(e.categorie)
        setStatut(e.statut)
        setPrix(e.prix ?? '')
        setContact(e.contact ?? '')
        setOrganisateurs(e.organisateurs ?? '')
        setImageUrl(e.image_url ?? null)
        setImagePosition(e.image_position ?? '50% 50%')
        setPromotion((e.promotion as 'basic' | 'pro' | 'max') ?? 'basic')
        setPromoOrdre(e.promo_ordre != null ? String(e.promo_ordre) : '')
        setLieuId(e.lieu_id ?? null)
        if (e.lieux) {
          setLieuNom(e.lieux.nom ?? '')
          setCommune(e.lieux.commune ?? '')
          setAdresse(e.lieux.adresse ?? '')
          setLat(e.lieux.lat?.toString() ?? '')
          setLng(e.lieux.lng?.toString() ?? '')
          setPlaceIdGoogle(e.lieux.place_id_google ?? null)
        }
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenementId])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewMime(file.type || 'image/jpeg')
    setImageFromExtract(false)
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setNewBase64(dataUrl.split(',')[1])
      setNewPreview(dataUrl)
      setMode('crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // V3: récupère une image depuis Pexels (Banque libre)
  const loadFromPexels = async () => {
    setPexelsLoading(true)
    try {
      const q = encodeURIComponent(titre || categorie || 'event')
      const r = await fetch(`/api/pexels?nom=${q}`)
      const d = await r.json()
      if (d.url) {
        // Récupère l'image en base64 pour pouvoir l'uploader comme les autres
        const imgRes = await fetch(d.url)
        const blob = await imgRes.blob()
        const reader = new FileReader()
        reader.onload = ev => {
          const dataUrl = ev.target?.result as string
          setNewBase64(dataUrl.split(',')[1])
          setNewMime(blob.type || 'image/jpeg')
          setNewPreview(dataUrl)
          setImageUrl(null)
          setImageFromExtract(false)
        }
        reader.readAsDataURL(blob)
      }
    } catch { /* ignore */ }
    finally { setPexelsLoading(false) }
  }

  const geocodeManual = useCallback(async () => {
    if (!lieuNom && !commune) return
    const q = [lieuNom, commune, 'France'].filter(Boolean).join(', ')
    const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`)
    const d = await res.json()
    if (d.lat) {
      setLat(d.lat.toString()); setLng(d.lng.toString())
      if (d.adresse) setAdresse(d.adresse)
      setPlaceIdGoogle('manual')
    }
  }, [lieuNom, commune])

  const handleLieuSelect = async (p: Prediction) => {
    const res = await fetch(`/api/admin/geocode?place_id=${encodeURIComponent(p.place_id)}`)
    const d = await res.json()
    if (!d.lat) return
    setLat(d.lat.toString())
    setLng(d.lng.toString())
    if (d.nom)     setLieuNom(d.nom)
    if (d.adresse) setAdresse(d.adresse)
    if (d.commune) setCommune(d.commune)
    setPlaceIdGoogle(p.place_id)
  }

  const save = async (statutOverride?: string) => {
    setSaving(true); setError(null)
    try {
      if (!evenementId) {
        // Mode création : POST à /api/evenements
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const res = await fetch('/api/evenements', {
          method: 'POST', headers,
          body: JSON.stringify({
            titre, description,
            date_debut: dateDebut || null, date_fin: dateFin || null, heure: heure || null,
            categorie,
            lieu_nom: lieuNom || null, commune: commune || null, adresse: adresse || null,
            lat: lat ? parseFloat(lat) : undefined,
            lng: lng ? parseFloat(lng) : undefined,
            place_id_google: placeIdGoogle || null,
            prix: prix || null, contact: contact || null, organisateurs: organisateurs || null,
            image: newBase64, imageMimeType: newMime, image_position: imagePosition,
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        onSaved?.({ statut: d.evenement?.statut, message: d.message, id: d.evenement?.id })
        return
      }

      // Mode édition : PATCH admin
      let finalUrl = imageUrl
      if (newBase64) {
        const r = await fetch('/api/admin/upload-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: newBase64, mimeType: newMime }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        finalUrl = d.url
      }

      const body: Record<string, unknown> = {
        titre, description,
        date_debut: dateDebut || null, date_fin: dateFin || null, heure: heure || null,
        categorie, statut: statutOverride ?? statut,
        prix: prix || null, contact: contact || null, organisateurs: organisateurs || null,
        image_url: finalUrl, image_position: imagePosition,
        promotion,
        promo_ordre: promotion === 'max' && promoOrdre !== '' ? parseInt(promoOrdre) : null,
      }
      if (lieuId) {
        body.lieu_id = lieuId
        body.lieu_nom = lieuNom
        body.adresse = adresse || null
        body.commune = commune || null
        body.lat = lat ? parseFloat(lat) : null
        body.lng = lng ? parseFloat(lng) : null
        body.place_id_google = placeIdGoogle
      }

      const r = await fetch(`/api/admin/evenements/${evenementId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onSaved?.(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally { setSaving(false) }
  }

  const deleteEvent = async () => {
    if (!confirm('Supprimer cet événement définitivement ?')) return
    await fetch(`/api/admin/evenements/${evenementId}`, { method: 'DELETE' })
    onSaved?.(); onClose()
  }

  const activeSrc = newPreview ?? imageUrl

  if (loading) return (
    <div className="fixed inset-0 z-[1000] bg-[#FBF7F0] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (mode === 'crop' && activeSrc) return (
    <CropStep src={activeSrc} position={imagePosition} onChange={setImagePosition}
      onConfirm={() => setMode('edit')}
      onBack={() => { setNewBase64(null); setNewPreview(null); setMode('edit') }} />
  )

  if (mode === 'fullscreen' && activeSrc) return (
    <div className="fixed inset-0 z-[1100] bg-black flex items-center justify-center" onClick={() => setMode('edit')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={activeSrc} alt="" className="max-w-full max-h-full object-contain" />
      <button className="absolute top-5 right-5 text-white text-2xl bg-black/40 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto" style={{ background: '#FDFAF5' }}>
      {/* V3 Header — back + DM Serif title + Annuler */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2.5 px-4 pt-3.5 pb-3" style={{ background: '#FDFAF5' }}>
        <button
          onClick={onClose}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            {evenementId ? 'Modifier l’événement' : 'Vérifier les infos'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 bg-transparent px-1 py-2 text-[12px] font-bold text-texte-doux"
        >
          Annuler
        </button>
      </div>

      <div className="px-4 pb-32 space-y-4">
        {/* Notice succès V3 — uniquement création */}
        {!evenementId && (
          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: '#E8F2EB', border: '1px solid #C5DCC9' }}>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="m-0 flex-1 text-[12px] leading-[1.5] text-texte">On a tout pré-rempli pour toi. Corrige si besoin avant de publier.</p>
          </div>
        )}

        {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-xl">{error}</div>}

        {/* V3 Section PHOTO */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Photo</p>
            {activeSrc && (
              <button
                onClick={() => fileRef.current?.click()}
                className="bg-transparent text-[11px] font-semibold text-texte-doux underline"
              >
                Pas la bonne ? Remplace-la
              </button>
            )}
          </div>
          {activeSrc ? (
            <div className="relative overflow-hidden rounded-2xl" style={{ height: 180, backgroundColor: '#F0EBE3' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeSrc} alt="" onClick={() => setMode('fullscreen')}
                className="absolute inset-0 h-full w-full cursor-zoom-in object-cover"
                style={{ objectPosition: imagePosition }} />
              {/* Badge EXTRAIT DE L'AFFICHE */}
              {imageFromExtract && (
                <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[#1A1209] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-white">
                  Extrait de l&apos;affiche
                </span>
              )}
              {/* Bouton Recadrer */}
              <button
                onClick={() => setMode('crop')}
                className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-texte backdrop-blur-sm"
              >
                Recadrer
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl" style={{ height: 100, backgroundColor: '#F0EBE3', border: '1px dashed #E5DDD2' }}>
              <span className="text-[12px] text-texte-doux">Aucune photo pour l&apos;instant</span>
            </div>
          )}

          {/* 3 boutons Caméra / Galerie / Banque libre */}
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white py-2.5 text-[11px] font-bold text-texte"
              style={{ border: '1px solid #F0EAE0' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Caméra
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white py-2.5 text-[11px] font-bold text-texte"
              style={{ border: '1px solid #F0EAE0' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              Galerie
            </button>
            <button
              onClick={loadFromPexels}
              disabled={pexelsLoading}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-bold text-primary disabled:opacity-55"
              style={{ background: '#E8F2EB', border: '1px solid #C5DCC9' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              {pexelsLoading ? '…' : 'Banque libre'}
            </button>
          </div>
          {/* Inputs file cachés */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <input ref={galleryRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        {/* Statut rapide — édition uniquement */}
        {evenementId && (
          <div className="flex gap-2">
            {statut !== 'publie' && (
              <button onClick={() => save('publie')} disabled={saving}
                className="flex-1 py-2.5 bg-green-500 text-white font-bold text-sm rounded-xl disabled:opacity-50">
                ✓ Publier
              </button>
            )}
            {statut === 'publie' && (
              <button onClick={() => save('en_attente')} disabled={saving}
                className="flex-1 py-2.5 bg-orange-400 text-white font-bold text-sm rounded-xl disabled:opacity-50">
                ⏸ Dépublier
              </button>
            )}
            {statut !== 'rejete' && (
              <button onClick={() => save('rejete')} disabled={saving}
                className="flex-1 py-2.5 bg-gray-300 text-gray-700 font-bold text-sm rounded-xl disabled:opacity-50">
                ✗ Rejeter
              </button>
            )}
          </div>
        )}

        {/* V3 TITRE */}
        <div>
          <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Titre</p>
          <input
            type="text" value={titre} onChange={e => setTitre(e.target.value)}
            placeholder="Titre de l'événement"
            className="w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
            style={{ border: '1px solid #F0EAE0' }}
          />
        </div>

        {/* V3 CATÉGORIE pills colorées */}
        <div>
          <p className="m-0 mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Catégorie</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CATEGORIES).map(([key, cat]) => {
              const active = categorie === key
              return (
                <button
                  key={key}
                  onClick={() => setCategorie(key as Categorie)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors"
                  style={
                    active
                      ? { backgroundColor: cat.color, color: '#fff', border: 'none' }
                      : { backgroundColor: '#fff', color: '#7A6A5A', border: '1px solid #F0EAE0' }
                  }
                >
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: active ? '#fff' : cat.color }} />
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* V3 DATE | HEURE 2-col */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Date</p>
            <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5" style={{ border: '1px solid #F0EAE0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-texte-doux"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-full border-none bg-transparent text-[13px] text-texte outline-none" />
            </div>
          </div>
          <div>
            <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Heure</p>
            <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5" style={{ border: '1px solid #F0EAE0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-texte-doux"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <input type="time" value={heure} onChange={e => setHeure(e.target.value)} className="w-full border-none bg-transparent text-[13px] text-texte outline-none" />
            </div>
          </div>
        </div>

        {/* V3 LIEU */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Lieu</p>
            <button onClick={geocodeManual} className="bg-transparent text-[11px] font-semibold text-primary underline">
              Changer
            </button>
          </div>
          <div className="rounded-xl bg-white p-3" style={{ border: '1px solid #F0EAE0' }}>
            <div className="flex items-start gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-primary"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div className="flex-1">
                <input type="text" value={lieuNom} onChange={e => setLieuNom(e.target.value)} placeholder="Nom du lieu" className="w-full border-none bg-transparent text-[14px] font-bold text-texte outline-none" />
                <input type="text" value={[adresse, commune].filter(Boolean).join(', ')} onChange={e => { const parts = e.target.value.split(','); setAdresse(parts[0]?.trim() ?? ''); setCommune(parts.slice(1).join(',').trim()) }} placeholder="Adresse, commune" className="w-full border-none bg-transparent text-[12px] text-texte-doux outline-none" />
              </div>
            </div>
          </div>
          {/* LieuSearch advanced (caché par défaut, utile pour autocomplete Google) */}
          <div className="mt-2">
            <LieuSearch onSelect={handleLieuSelect} />
          </div>
        </div>

        {/* V3 DESCRIPTION */}
        <div>
          <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Description</p>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Décris l'événement…"
            className="block w-full resize-none rounded-xl bg-white px-3.5 py-2.5 text-[13px] leading-[1.5] text-texte outline-none focus:border-primary"
            style={{ border: '1px solid #F0EAE0' }}
          />
        </div>

        {/* V3 PRIX | CONTACT 2-col */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Prix</p>
            <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5" style={{ border: '1px solid #F0EAE0' }}>
              <span className="text-[14px] text-texte-doux">€</span>
              <input type="text" value={prix} onChange={e => setPrix(e.target.value)} placeholder="Gratuit, 5…" className="w-full border-none bg-transparent text-[13px] text-texte outline-none" />
            </div>
          </div>
          <div>
            <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Contact</p>
            <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5" style={{ border: '1px solid #F0EAE0' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-texte-doux"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <input type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="06 12…" className="w-full border-none bg-transparent text-[13px] text-texte outline-none" />
            </div>
          </div>
        </div>

        {/* V3 ORGANISATEURS */}
        <div>
          <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Organisateurs</p>
          <input
            type="text" value={organisateurs} onChange={e => setOrganisateurs(e.target.value)}
            placeholder="Association, mairie…"
            className="w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
            style={{ border: '1px solid #F0EAE0' }}
          />
        </div>

        {/* Promotion — édition uniquement */}
        {evenementId && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Promotion</label>
            <div className="flex gap-2">
              {([
                { key: 'basic', label: 'Normal',  bg: '#6B7280', desc: 'Affichage standard' },
                { key: 'pro',   label: '★ Pro',   bg: '#EC407A', desc: 'Bandeau + carte' },
                { key: 'max',   label: '⚡ Max',  bg: '#7C3AED', desc: 'Plein écran' },
              ] as { key: 'basic'|'pro'|'max'; label: string; bg: string; desc: string }[]).map(opt => (
                <button key={opt.key} onClick={() => setPromotion(opt.key)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all"
                  style={promotion === opt.key
                    ? { backgroundColor: opt.bg, color: '#fff', borderColor: opt.bg }
                    : { backgroundColor: '#fff', color: opt.bg, borderColor: opt.bg + '66' }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.8, marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ordre carrousel splash — uniquement plan max, édition uniquement */}
        {evenementId && promotion === 'max' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Ordre dans le splash <span style={{ color: '#7C3AED' }}>⚡</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">1 = affiché en premier. Laisser vide = dernier.</p>
            <input
              type="number" min={1} value={promoOrdre}
              onChange={e => setPromoOrdre(e.target.value)}
              placeholder="ex: 1"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              style={{ outline: 'none' }}
            />
          </div>
        )}

        {/* Vedette du hub : déprécié — utiliser le bouton ⭐ Mettre en avant sur la fiche */}

        {/* Supprimer — édition uniquement */}
        {evenementId && (
          <button onClick={deleteEvent}
            className="w-full py-3 bg-red-50 text-red-500 font-bold text-sm rounded-xl border border-red-100">
            🗑️ Supprimer cet événement
          </button>
        )}
      </div>

      {/* Sticky CTA bottom — V3 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20"
        style={{ background: '#FFFFFF', borderTop: '1px solid #EDE8E0', padding: '12px 16px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
      >
        <button
          onClick={() => save()}
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-none bg-primary text-[14px] font-bold text-white disabled:opacity-55"
        >
          {saving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Publication en cours…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {evenementId ? 'Sauvegarder' : 'Publier l\'événement'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
