'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Categorie } from '@/lib/types'
import MicButton, { type MicButtonHandle } from '@/components/MicButton'
import EventEditDrawer from '@/components/EventEditDrawer'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { supabase } from '@/lib/supabase'

function CropModal({ previewUrl, position, onChange, onConfirm }: {
  previewUrl: string
  position: string
  onChange: (pos: string) => void
  onConfirm: () => void
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
    <div className="fixed inset-0 z-50 bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
        <p className="text-white font-bold text-lg">Cadrer la photo</p>
        <button
          onClick={onConfirm}
          className="bg-[#C4622D] text-white px-5 py-2 rounded-xl font-bold text-sm"
        >
          OK
        </button>
      </div>

      {/* Image interactive — plein écran */}
      <div
        ref={containerRef}
        className="flex-1 relative touch-none select-none cursor-crosshair"
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
        {/* Lignes de tiers */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '33.33% 33.33%',
        }} />
        {/* Point focal */}
        <div
          className="absolute pointer-events-none"
          style={{ left: `${px}%`, top: `${py}%`, transform: 'translate(-50%, -50%)' }}
        >
          <div className="w-10 h-10 rounded-full border-[3px] border-white shadow-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(196,98,45,0.65)' }}>
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        </div>
      </div>

      {/* Instruction bas */}
      <div className="px-4 py-4 flex-shrink-0 text-center">
        <p className="text-white/60 text-sm">Appuie sur la partie importante de la photo</p>
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

type Step = 'input' | 'crop' | 'preview' | 'success'

export default function AjouterPage() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
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
  const [submitMessage, setSubmitMessage] = useState<string | undefined>()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const micRef = useRef<MicButtonHandle>(null)
  const [micRecording, setMicRecording] = useState(false)

  // Bloquer l'accès si non connecté (après chargement auth)
  useEffect(() => {
    if (!authLoading && !user) openAuthModal()
  }, [authLoading, user, openAuthModal])

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
      setStep('crop')
    }
    reader.readAsDataURL(file)
  }

  const handleAnalyse = async () => {
    if (!texte.trim()) return
    if (!user) { openAuthModal(); return }
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/extract/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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

  const resetImage = () => {
    setImage(null)
    setImagePreviewUrl(null)
    setImagePosition('50% 50%')
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  // ── Cadrage photo ─────────────────────────────────────────────────────────────
  if (step === 'crop' && imagePreviewUrl) {
    return (
      <CropModal
        previewUrl={imagePreviewUrl}
        position={imagePosition}
        onChange={setImagePosition}
        onConfirm={() => setStep('input')}
      />
    )
  }

  // ── Succès V3 ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    const isSubmitted = submitMessage === 'submitted'
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-creme px-8 text-center font-inter">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2
          className="m-0 mb-2 font-serif text-[28px] font-normal text-texte"
          style={{ letterSpacing: '-0.02em' }}
        >
          {isSubmitted ? 'Événement soumis !' : 'Publié !'}
        </h2>
        <p className="m-0 mb-8 max-w-[300px] text-[13px] leading-[1.5] text-texte-doux">
          {isSubmitted
            ? 'Votre événement sera publié après vérification, dans moins d\'une heure.'
            : 'Ton événement a été publié avec succès.'}
        </p>
        <div className="flex w-full max-w-[280px] flex-col gap-3">
          {eventId && !isSubmitted && (
            <Link
              href={`/evenement/${eventId}`}
              className="block rounded-2xl bg-primary py-3 text-center text-[14px] font-bold text-white no-underline"
            >
              Voir l&apos;événement
            </Link>
          )}
          {isSubmitted ? (
            <Link
              href="/"
              className="block rounded-2xl bg-primary py-3 text-center text-[14px] font-bold text-white no-underline"
            >
              Retour à l&apos;accueil
            </Link>
          ) : (
            <>
              <button
                onClick={() => { setStep('input'); setTexte(''); setForm(emptyForm); resetImage(); setSubmitMessage(undefined) }}
                className="rounded-2xl border-[1.5px] border-primary bg-transparent py-3 text-[13px] font-bold text-primary"
              >
                Ajouter un autre événement
              </button>
              <Link href="/" className="text-center text-[12px] text-texte-doux underline">
                Retour à l&apos;accueil
              </Link>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Preview ──────────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <EventEditDrawer
        initialData={form}
        initialImage={image ? { base64: image, mime: imageMimeType, preview: imagePreviewUrl!, position: imagePosition } : null}
        onClose={() => setStep('input')}
        onSaved={(result) => {
          setEventId(result?.id ?? null)
          setSubmitMessage(result?.message)
          setStep('success')
        }}
      />
    )
  }

  // ── Saisie V3 ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar V3 */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
        <Link
          href="/"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte no-underline shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Nouvel événement
          </div>
        </div>
        <Link
          href="/"
          className="shrink-0 bg-transparent px-1 py-2 text-[12px] font-bold text-texte-doux no-underline"
        >
          Annuler
        </Link>
      </div>

      {/* Hero intro V3 — copy mockup */}
      <div className="px-4 pt-6">
        <h1
          className="m-0 font-serif text-[26px] leading-[1.1] text-texte"
          style={{ letterSpacing: '-0.02em', fontWeight: 700 }}
        >
          Capture-le, on s&apos;occupe du reste
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-texte-doux">
          Choisis ta méthode. On extrait le titre, la date, le lieu, le prix… tu vérifies, tu publies.
        </p>
      </div>

      {/* 2 file inputs cachés (caméra + galerie) */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

      {/* MicButton invisible — déclenché par Card 2 via ref */}
      <MicButton ref={micRef} hidden onTranscript={t => { setTexte(prev => prev ? prev + ' ' + t : t); setMicRecording(false) }} />

      {/* ─── Card 1: Photo d'une affiche (border primary) ─── */}
      <div className="px-4 pt-5">
        <div
          className="rounded-2xl bg-white p-3.5 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
          style={{ border: '1.5px solid #2D5A3D' }}
        >
          <div className="mb-3 flex items-center gap-3">
            {/* Icon dark green filled, white camera */}
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-white">
                  RAPIDE
                </span>
                <span className="text-[11px] text-texte-doux">~ 5 sec</span>
              </div>
              <div className="text-[15px] font-extrabold leading-tight text-texte">Photo d&apos;une affiche</div>
              <div className="mt-0.5 text-[11px] text-texte-doux">On lit l&apos;image et on remplit toutes les infos.</div>
            </div>
          </div>
          {/* 2 boutons cremeDeep avec icônes */}
          <div className="flex gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cremeDeep py-2.5 text-[12px] font-bold text-texte"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Prendre une photo
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cremeDeep py-2.5 text-[12px] font-bold text-texte"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              Choisir
            </button>
          </div>

          {imagePreviewUrl && (
            <div className="mt-3 flex items-stretch gap-2">
              <div className="relative h-[70px] flex-1 overflow-hidden rounded-xl">
                <img src={imagePreviewUrl} alt="preview" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: imagePosition }} />
                <button onClick={() => setStep('crop')} className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Modifier le cadrage</span>
                </button>
              </div>
              <button onClick={resetImage} aria-label="Supprimer la photo" className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte-doux">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Divider OU ─── */}
      <div className="flex items-center justify-center px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-texte-tres-doux">OU</span>
      </div>

      {/* ─── Card 2: Dictée vocale (clickable card → trigger mic) ─── */}
      <div className="px-4">
        <button
          type="button"
          onClick={() => { setMicRecording(prev => !prev); micRef.current?.toggle() }}
          className="flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
          style={{ borderColor: micRecording ? '#C84B2F' : '#F0EAE0', transition: 'border-color 0.18s' }}
        >
          <div
            className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl text-accent ${
              micRecording ? 'animate-pulse bg-accent text-white' : 'bg-[#FFF0E5]'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold leading-tight text-texte">
              {micRecording ? 'Enregistrement en cours…' : 'Dicter vocalement'}
            </div>
            <div className="mt-0.5 text-[11px] text-texte-doux">
              {micRecording
                ? 'Tape de nouveau pour arrêter et transcrire.'
                : 'Parle naturellement. Ex : « Concert samedi 20h salle des fêtes 8 euros ».'}
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-tres-doux">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </button>
      </div>

      {/* ─── Divider OU ─── */}
      <div className="flex items-center justify-center px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-texte-tres-doux">OU</span>
      </div>

      {/* ─── Card 3: Écrire / coller un texte ─── */}
      <div className="px-4">
        <div
          className="rounded-2xl border bg-white p-3.5 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
          style={{ borderColor: '#F0EAE0' }}
        >
          <div className="mb-3 flex items-center gap-3">
            {/* Icon light blue filled, doc icon */}
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#3A5BC7]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold leading-tight text-texte">Écrire ou coller un texte</div>
              <div className="mt-0.5 text-[11px] text-texte-doux">SMS, message WhatsApp, copier-coller…</div>
            </div>
          </div>
          {/* Textarea on cremeDeep zone */}
          <div className="rounded-xl bg-cremeDeep p-3">
            <textarea
              value={texte}
              onChange={e => setTexte(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="Concert de jazz samedi 12 avril à 20h à la salle des fêtes de Ganges. Entrée 8€. Contact : 06 12 34 56 78"
              className="block w-full resize-none border-none bg-transparent text-[13px] leading-[1.5] text-texte outline-none placeholder:text-texte-tres-doux"
              style={{ minHeight: 90 }}
            />
          </div>
          {/* Hint + counter */}
          <div className="mt-2 flex items-center justify-between text-[11px] text-texte-doux">
            <span>Tu choisiras la photo à l&apos;étape suivante.</span>
            <span>{texte.length}/2000</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 pt-3.5">
          <p className="m-0 rounded-xl border bg-[#FBE9E5] px-3.5 py-3 text-[13px] text-[#B53A22]" style={{ borderColor: '#F5C8A8' }}>
            {error}
          </p>
        </div>
      )}

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white p-3.5" style={{ borderColor: '#EDE8E0' }}>
        <button
          onClick={handleAnalyse}
          disabled={loading || (!texte.trim() && !image)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-none bg-primary text-[14px] font-bold text-white disabled:opacity-55"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Analyse en cours…
            </>
          ) : (
            <>
              Extraire les infos
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="13 6 19 12 13 18"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
