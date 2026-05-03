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
interface Props {
  evenementId: string
  onClose: () => void
  onSaved?: () => void
}

export default function EventEditDrawer({ evenementId, onClose, onSaved }: Props) {
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

  const [imageUrl, setImageUrl]           = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState('50% 50%')
  const [newBase64, setNewBase64]         = useState<string | null>(null)
  const [newMime, setNewMime]             = useState('image/jpeg')
  const [newPreview, setNewPreview]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
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
  }, [evenementId])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewMime(file.type || 'image/jpeg')
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

  const inp = (label: string, value: string, set: (v: string) => void, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
        className="w-full bg-white border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]" />
    </div>
  )

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
    <div className="fixed inset-0 z-[1000] bg-[#FBF7F0] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#2C1810] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-[#C4622D] font-bold text-xl leading-none">←</button>
        <span className="font-bold flex-1 truncate text-sm">{titre || 'Éditer'}</span>
        <button onClick={() => save()} disabled={saving}
          className="bg-[#C4622D] text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50">
          {saving ? '…' : 'Sauvegarder'}
        </button>
      </div>

      <div className="p-4 space-y-4 pb-10">
        {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-xl">{error}</div>}

        {/* Image */}
        <div>
          {activeSrc ? (
            <div className="relative rounded-2xl overflow-hidden" style={{ height: 200, backgroundColor: '#f0ece6' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeSrc} alt="" onClick={() => setMode('fullscreen')}
                className="w-full h-full object-cover cursor-zoom-in"
                style={{ objectPosition: imagePosition }} />
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button onClick={() => setMode('crop')}
                  className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">✂️ Recadrer</button>
                <button onClick={() => fileRef.current?.click()}
                  className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">📷 Changer</button>
                <button onClick={() => { setImageUrl(null); setNewBase64(null); setNewPreview(null) }}
                  className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full h-24 rounded-2xl border-2 border-dashed border-[#E8E0D5] bg-white text-gray-400 text-sm">
              + Ajouter une image
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        {/* Statut rapide */}
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

        {/* Catégorie */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Catégorie</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button key={key} onClick={() => setCategorie(key as Categorie)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  categorie === key ? 'text-white border-transparent' : 'bg-white border-[#E8E0D5] text-gray-500'
                }`}
                style={categorie === key ? { backgroundColor: cat.color } : {}}>
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {inp('Titre', titre, setTitre, 'text', 'Titre de l\'événement')}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            className="w-full bg-white border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D] resize-none" />
        </div>

        {/* Dates & heure */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date &amp; Heure</p>
          <div className="grid grid-cols-2 gap-3">
            {inp('Date début', dateDebut, setDateDebut, 'date')}
            {inp('Date fin', dateFin, setDateFin, 'date')}
          </div>
          {inp('Heure', heure, setHeure, 'time')}
        </div>

        {/* Lieu */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lieu</p>
          <LieuSearch onSelect={handleLieuSelect} />

          {/* Champs remplis après sélection, éditables */}
          <div className="space-y-2 bg-white rounded-2xl p-3 border border-[#E8E0D5]">
            {inp('Nom du lieu', lieuNom, setLieuNom, 'text', 'Salle des fêtes…')}
            <div className="grid grid-cols-2 gap-2">
              {inp('Commune', commune, setCommune, 'text', 'Ganges')}
              {inp('Adresse', adresse, setAdresse, 'text', '12 rue…')}
            </div>
            {lat && lng ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-green-600 font-medium">
                  ✓ {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
                  {placeIdGoogle && placeIdGoogle !== 'manual' ? ' · Google Places' : ' · manuel'}
                </p>
                <button onClick={geocodeManual} className="text-xs text-gray-400 underline">Relocaliser</button>
              </div>
            ) : (
              <button onClick={geocodeManual}
                className="w-full py-2 bg-[#FBF7F0] border border-[#C4622D] text-[#C4622D] text-xs font-bold rounded-xl">
                📍 Localiser depuis les champs ci-dessus
              </button>
            )}
          </div>
        </div>

        {/* Infos pratiques */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Infos pratiques</p>
          {inp('Prix', prix, setPrix, 'text', 'Gratuit, 5€…')}
          {inp('Contact', contact, setContact, 'text', 'Email, téléphone…')}
          {inp('Organisateurs', organisateurs, setOrganisateurs, 'text', 'Association, mairie…')}
        </div>

        {/* Supprimer */}
        <button onClick={deleteEvent}
          className="w-full py-3 bg-red-50 text-red-500 font-bold text-sm rounded-xl border border-red-100">
          🗑️ Supprimer cet événement
        </button>
      </div>
    </div>
  )
}
