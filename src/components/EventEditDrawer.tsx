'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Categorie, Evenement } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'

type Mode = 'edit' | 'crop' | 'fullscreen'

interface Props {
  evenementId: string
  onClose: () => void
  onSaved?: () => void
}

// ── Crop inline (même logique que capturer/page.tsx) ──────────────────────
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

// ── Composant principal ───────────────────────────────────────────────────
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
  const [statut, setStatut]             = useState('en_attente')
  const [lieuId, setLieuId]             = useState<string | null>(null)
  const [lieuNom, setLieuNom]           = useState('')
  const [commune, setCommune]           = useState('')
  const [lat, setLat]                   = useState('')
  const [lng, setLng]                   = useState('')

  const [imageUrl, setImageUrl]         = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState('50% 50%')
  const [newBase64, setNewBase64]       = useState<string | null>(null)
  const [newMime, setNewMime]           = useState('image/jpeg')
  const [newPreview, setNewPreview]     = useState<string | null>(null)
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
        setImageUrl((e as Evenement & { image_url?: string }).image_url ?? null)
        setImagePosition((e as Evenement & { image_position?: string }).image_position ?? '50% 50%')
        setLieuId(e.lieu_id ?? null)
        if (e.lieux) {
          setLieuNom(e.lieux.nom ?? '')
          setCommune(e.lieux.commune ?? '')
          setLat(e.lieux.lat?.toString() ?? '')
          setLng(e.lieux.lng?.toString() ?? '')
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

  const geocode = useCallback(async () => {
    if (!lieuNom && !commune) return
    const q = [lieuNom, commune, 'France'].filter(Boolean).join(', ')
    const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`)
    const d = await res.json()
    if (d.lat) { setLat(d.lat.toString()); setLng(d.lng.toString()) }
  }, [lieuNom, commune])

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
        prix: prix || null, contact: contact || null,
        image_url: finalUrl, image_position: imagePosition,
      }
      if (lieuId) {
        body.lieu_id = lieuId; body.lieu_nom = lieuNom
        body.commune = commune || null
        body.lat = lat ? parseFloat(lat) : null
        body.lng = lng ? parseFloat(lng) : null
        if (lat && lng) body.place_id_google = 'manual'
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

  const inp = (label: string, value: string, set: (v: string) => void, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
        className="w-full bg-white border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[1000] bg-[#FBF7F0] overflow-y-auto">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-[#2C1810] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-[#C4622D] font-bold text-xl leading-none">←</button>
        <span className="font-bold flex-1 truncate">{titre || 'Éditer'}</span>
        <button onClick={() => save()} disabled={saving}
          className="bg-[#C4622D] text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50">
          {saving ? '…' : 'Sauvegarder'}
        </button>
      </div>

      <div className="p-4 space-y-4 pb-32">
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
                  className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                  ✂️ Recadrer
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                  📷 Changer
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full h-24 rounded-2xl border-2 border-dashed border-[#E8E0D5] bg-white text-gray-400 text-sm cursor-pointer">
              + Ajouter une image
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-xl">{error}</div>}

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

        <div className="grid grid-cols-2 gap-3">
          {inp('Date début', dateDebut, setDateDebut, 'date')}
          {inp('Date fin', dateFin, setDateFin, 'date')}
        </div>
        {inp('Heure', heure, setHeure, 'time')}
        {inp('Prix', prix, setPrix, 'text', 'Ex: 5€, Gratuit')}
        {inp('Contact', contact, setContact, 'text', 'Email, téléphone...')}

        {/* Lieu */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Lieu</label>
          {inp('Nom du lieu', lieuNom, setLieuNom, 'text', 'Salle des fêtes...')}
          <div className="flex gap-2">
            {inp('Commune', commune, setCommune, 'text', 'Ganges')}
            <button onClick={geocode}
              className="shrink-0 self-end mb-px px-3 py-2.5 bg-[#C4622D] text-white text-xs font-bold rounded-xl">
              📍
            </button>
          </div>
          {lat && lng && (
            <p className="text-xs text-green-600 font-medium">✓ Coordonnées : {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}</p>
          )}
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
