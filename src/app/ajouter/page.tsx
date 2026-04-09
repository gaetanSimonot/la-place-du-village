'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { Categorie } from '@/lib/types'
import MicButton from '@/components/MicButton'

function FocalPointPicker({ previewUrl, position, onChange }: {
  previewUrl: string
  position: string
  onChange: (pos: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [px, py] = position.split(' ').map(v => parseFloat(v))

  const handlePointer = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
    const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
    onChange(`${x}% ${y}%`)
  }

  return (
    <div className="mt-3">
      <p className="text-xs text-gray-500 mb-1.5">
        Appuie sur la partie importante de la photo pour cadrer
      </p>
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden cursor-crosshair touch-none select-none"
        style={{ height: 144 }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={e => { if (e.buttons > 0) handlePointer(e) }}
      >
        <img
          src={previewUrl}
          alt="preview"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: position }}
        />
        {/* Overlay semi-transparent avec trou au focal point */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.25)' }} />
        {/* Indicateur focal */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${px}%`,
            top: `${py}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(196,98,45,0.7)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        </div>
        {/* Lignes de tiers (guide composition) */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '33.33% 33.33%',
        }} />
      </div>
    </div>
  )
}

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

export default function AjouterPage() {
  const [step, setStep] = useState<Step>('input')
  const [texte, setTexte] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageMimeType, setImageMimeType] = useState('image/jpeg')
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState('50% 50%')
  const [form, setForm] = useState<FormData>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageMimeType(file.type || 'image/jpeg')
    setImagePosition('50% 50%')
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImagePreviewUrl(result)
      setImage(result.split(',')[1]) // base64 only for API
    }
    reader.readAsDataURL(file)
  }

  const handleAnalyse = async () => {
    if (!texte.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/extract/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texte, image }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // L'API retourne { events: [...] } — on prend le premier event valide
      const events: Array<Record<string, string>> = data.events ?? []
      const e = events.find(ev => ev?.titre) ?? events[0]
      if (!e) throw new Error('Aucun événement détecté')
      setForm({
        titre: e.titre ?? '',
        description: e.description ?? '',
        date_debut: e.date_debut ?? '',
        date_fin: e.date_fin ?? '',
        heure: e.heure ?? '',
        categorie: (e.categorie ?? 'autre') as Categorie,
        lieu_nom: e.lieu_nom ?? '',
        commune: e.commune ?? '',
        prix: e.prix ?? '',
        contact: e.contact ?? '',
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
        body: JSON.stringify({ ...form, image, imageMimeType, image_position: imagePosition }),
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

  const resetImage = () => {
    setImage(null)
    setImagePreviewUrl(null)
    setImagePosition('50% 50%')
    if (fileRef.current) fileRef.current.value = ''
  }

  const field = (label: string, key: keyof FormData, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </label>
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
            <Link
              href={`/evenement/${eventId}`}
              className="block bg-[#C4622D] text-white text-center py-3 rounded-2xl font-bold"
            >
              Voir l&apos;événement
            </Link>
          )}
          <button
            onClick={() => { setStep('input'); setTexte(''); setForm(emptyForm); resetImage() }}
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

          {imagePreviewUrl && (
            <div className="bg-white rounded-2xl p-4">
              <p className="text-sm font-semibold text-[#2C1810] mb-1">Cadrage de la photo 📷</p>
              <FocalPointPicker
                previewUrl={imagePreviewUrl}
                position={imagePosition}
                onChange={setImagePosition}
              />
            </div>
          )}

          <div className="bg-white rounded-2xl p-4 space-y-3">
            {field('Titre *', 'titre', 'text', 'Nom de l\'événement')}

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

          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{error}</p>
          )}
        </div>

        {/* Bouton fixe en bas */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#E8E0D5]">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-[#C4622D] text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Publication...' : 'Publier l\'événement'}
          </button>
        </div>
      </div>
    )
  }

  // ── Saisie ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold text-[#2C1810] flex-1">Ajouter un événement</h1>
      </div>

      <div className="p-4 space-y-4 pb-32">
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#2C1810]">Décris ton événement ✍️</p>
            <MicButton onTranscript={t => setTexte(prev => prev ? prev + ' ' + t : t)} />
          </div>
          <p className="text-xs text-gray-500">
            Copie-colle un message WhatsApp, une annonce, un texte... L&apos;IA extrait automatiquement les infos.
          </p>
          <textarea
            value={texte}
            onChange={e => setTexte(e.target.value)}
            rows={6}
            placeholder={"Concert de jazz samedi 12 avril à 20h à la salle des fêtes de Ganges. Entrée 8€. Contact : 06 12 34 56 78"}
            className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] resize-none focus:outline-none focus:border-[#C4622D]"
          />
        </div>

        {/* Photo optionnelle */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-sm font-semibold text-[#2C1810] mb-2">Photo (optionnelle) 📷</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            className="hidden"
          />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className={`flex-1 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors ${
                image
                  ? 'border-[#C4622D] text-[#C4622D]'
                  : 'border-[#E8E0D5] text-gray-400'
              }`}
            >
              {image ? '✓ Changer la photo' : 'Choisir une photo'}
            </button>
            {image && (
              <button
                onClick={resetImage}
                className="px-3 py-3 rounded-xl border-2 border-[#E8E0D5] text-gray-400 text-sm"
                aria-label="Supprimer la photo"
              >
                ✕
              </button>
            )}
          </div>
          {imagePreviewUrl && (
            <FocalPointPicker
              previewUrl={imagePreviewUrl}
              position={imagePosition}
              onChange={setImagePosition}
            />
          )}
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{error}</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#E8E0D5]">
        <button
          onClick={handleAnalyse}
          disabled={loading || !texte.trim()}
          className="w-full bg-[#C4622D] text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyse en cours...
            </span>
          ) : 'Analyser avec l\'IA →'}
        </button>
      </div>
    </div>
  )
}
