'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { Categorie } from '@/lib/types'

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

type Step = 'input' | 'preview' | 'success'

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

export default function CapturerPage() {
  const [step, setStep] = useState<Step>('input')
  const [texte, setTexte] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState('image/jpeg')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result as string
      const rawBase64 = result.split(',')[1]
      const mimeType = file.type || 'image/jpeg'
      const compressed = await compressImage(rawBase64, mimeType)
      setImageBase64(compressed.data)
      setImageMime(compressed.mime)
      setImagePreview(`data:${compressed.mime};base64,${compressed.data}`)
    }
    reader.readAsDataURL(file)
  }

  const handleAnalyse = async () => {
    if (!imageBase64 && !texte.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/extract/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texte || null, image: imageBase64, imageMimeType: imageMime }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const e = data.extracted
      setForm({
        titre:        e.titre        ?? '',
        description:  e.description  ?? '',
        date_debut:   e.date_debut   ?? '',
        date_fin:     e.date_fin     ?? '',
        heure:        e.heure        ?? '',
        categorie:    e.categorie    ?? 'autre',
        lieu_nom:     e.lieu_nom     ?? '',
        commune:      e.commune      ?? '',
        prix:         e.prix         ?? '',
        contact:      e.contact      ?? '',
        organisateurs: e.organisateurs ?? '',
      })
      setStep('preview')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.titre.trim()) { setError('Le titre est requis'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/evenements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, image: imageBase64, imageMimeType: imageMime }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEventId(data.evenement.id)
      setStep('success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
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

  // ── Succès ───────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#FBF7F0] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold text-[#2C1810] mb-2">Merci !</h2>
        <p className="text-gray-600 text-sm mb-8">
          Ton événement a été soumis et sera vérifié avant publication.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {eventId && (
            <Link href={`/evenement/${eventId}`} className="block bg-[#C4622D] text-white text-center py-3 rounded-2xl font-bold">
              Voir l&apos;événement
            </Link>
          )}
          <button
            onClick={() => { setStep('input'); setTexte(''); setForm(emptyForm); setImageBase64(null); setImagePreview(null) }}
            className="py-3 rounded-2xl font-medium text-[#C4622D] border-2 border-[#C4622D]"
          >
            Ajouter un autre événement
          </button>
          <Link href="/" className="text-sm text-gray-400 underline text-center">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    )
  }

  // ── Preview ──────────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="min-h-screen bg-[#FBF7F0]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('input')} className="text-[#C4622D] font-bold text-2xl leading-none">←</button>
          <h1 className="font-bold text-[#2C1810] flex-1">Vérifier l&apos;événement</h1>
        </div>

        <div className="p-4 space-y-3 pb-32">
          <p className="text-sm text-gray-500">L&apos;IA a rempli les champs — vérifie et corrige si besoin.</p>

          {/* Miniature image */}
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
            onClick={handleSubmit}
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
            <img src={imagePreview} alt="Aperçu" className="w-full max-h-72 object-cover" />
            <button
              onClick={() => { setImageBase64(null); setImagePreview(null) }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold"
            >
              ×
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
          <p className="text-sm font-semibold text-[#2C1810] mb-2">
            Infos complémentaires <span className="text-gray-400 font-normal">(optionnel)</span>
          </p>
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
