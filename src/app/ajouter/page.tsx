'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Categorie } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import EventEditDrawer, { type EventDraft } from '@/components/EventEditDrawer'
import CropRect from '@/components/CropRect'
import DicteeModal from '@/components/DicteeModal'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { supabase } from '@/lib/supabase'
import { compressToBase64 } from '@/lib/clientUpload'

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

type Step = 'input' | 'crop' | 'preview' | 'manual' | 'success' | 'selection' | 'edit-one'
type Mode = 'idle' | 'photo' | 'text'

interface SubmitResult {
  titre: string
  ok:    boolean
  statut?: string
  message?: string
}

/** Convertit un event brut renvoyé par /api/extract/preview en EventDraft. */
function extractedToDraft(e: Record<string, string | null | undefined>): EventDraft {
  return {
    titre:         e.titre        ?? '',
    description:   e.description  ?? '',
    date_debut:    e.date_debut   ?? '',
    date_fin:      e.date_fin     ?? '',
    heure:         e.heure        ?? '',
    categorie:    (e.categorie    ?? 'autre') as Categorie,
    lieu_nom:      e.lieu_nom     ?? '',
    commune:       e.commune      ?? '',
    adresse:       e.lieu_adresse ?? '',
    lat:           null,
    lng:           null,
    place_id_google: null,
    prix:          e.prix         ?? '',
    contact:       e.contact      ?? '',
    organisateurs: e.organisateurs ?? '',
    image_base64:  null,
    image_mime:    'image/jpeg',
    image_preview: null,
    image_position: '50% 50%',
    image_from_extract: false,
  }
}

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
  const [dicteeOpen, setDicteeOpen] = useState(false)

  // Contexte fiche établissement : si on arrive depuis /ajouter?etab=<id>,
  // l'event est rattaché à cette fiche (publication directe pour le
  // propriétaire) et le lieu est pré-rempli avec l'établissement.
  const [etabId, setEtabId] = useState<string | null>(null)
  const [etabCtx, setEtabCtx] = useState<{ nom: string; commune: string; adresse: string; lat: number | null; lng: number | null } | null>(null)

  // ── Multi-events : liste de drafts éditables avec checkboxes ──────────────
  const [events, setEvents]         = useState<EventDraft[]>([])
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [submitProgress, setSubmitProgress] = useState(0)
  const [submitResults, setSubmitResults]   = useState<SubmitResult[]>([])

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ─── Mode mutex ───────────────────────────────────────────────────────
  // 'idle' tant qu'aucun input ; bascule en 'photo' dès qu'une image est
  // chargée, 'text' dès qu'un caractère est tapé. Le mode actif détermine
  // ce qui est grisé/désactivé.
  const mode: Mode = image ? 'photo' : (texte.trim() ? 'text' : 'idle')
  const photoDisabled = mode === 'text'
  const textDisabled  = mode === 'photo'

  // Bloquer l'accès si non connecté (après chargement auth)
  useEffect(() => {
    if (!authLoading && !user) openAuthModal()
  }, [authLoading, user, openAuthModal])

  // Lecture du ?etab=<id> (window.location pour ne pas casser le prerender
  // statique avec useSearchParams) + chargement des infos de la fiche pour
  // pré-remplir le lieu.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('etab')
    if (!id) return
    setEtabId(id)
    supabase.from('etablissements')
      .select('nom, commune, adresse, lat, lng').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (data) setEtabCtx({
          nom: data.nom ?? '', commune: data.commune ?? '', adresse: data.adresse ?? '',
          lat: data.lat ?? null, lng: data.lng ?? null,
        })
      })
  }, [])

  // initialData du mode manuel : vide, ou pré-rempli avec le lieu de la fiche.
  const manualInitial = etabCtx ? {
    ...emptyForm,
    lieu_nom: etabCtx.nom,
    commune: etabCtx.commune,
    adresse: etabCtx.adresse,
    lat: etabCtx.lat,
    lng: etabCtx.lng,
    place_id_google: `etab:${etabId}`,
  } : emptyForm

  // ─── Handlers ─────────────────────────────────────────────────────────
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImagePosition('50% 50%')
    try {
      // Compression agressive avant envoi serveur (Claude vision n a pas
      // besoin de la HD originale). Reduit le payload Vercel de 50-70%.
      const { base64, mimeType } = await compressToBase64(file, { maxDim: 1280, quality: 0.78 })
      setImageMimeType(mimeType)
      // Pour la preview, on reconstruit le dataURL depuis le base64 compresse
      setImagePreviewUrl(`data:${mimeType};base64,${base64}`)
      setImage(base64)
      setStep('crop')
    } catch {
      // Fallback : envoie l original sans compression si le canvas plante
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        setImageMimeType(file.type || 'image/jpeg')
        setImagePreviewUrl(result)
        setImage(result.split(',')[1])
        setStep('crop')
      }
      reader.readAsDataURL(file)
    }
  }

  const handlePhotoClick = (which: 'camera' | 'gallery') => {
    if (photoDisabled) return
    if (which === 'camera') cameraRef.current?.click()
    else galleryRef.current?.click()
  }

  const handleMicClick = () => {
    if (textDisabled) return
    setDicteeOpen(true)
  }

  const handleAnalyse = async () => {
    if (!texte.trim() && !image) return
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

      // L'API retourne { events: [...] }. On filtre les events avec titre +
      // date + lieu minimum (sinon l'IA a juste partiellement extrait).
      const raw: Array<Record<string, string>> = data.events ?? []
      const valid = raw.filter(e =>
        e != null && e.titre?.trim() && e.date_debut &&
        (e.lieu_nom?.trim() || e.commune?.trim())
      )

      if (valid.length === 0) throw new Error('Aucun événement détecté')

      if (valid.length === 1) {
        // 1 seul → preview single (drawer direct, comportement actuel)
        const e = valid[0]
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
      } else {
        // Plusieurs → écran de sélection multi-events
        const drafts = valid.map(extractedToDraft)
        setEvents(drafts)
        setSelected(new Set(drafts.map((_, i) => i)))
        setStep('selection')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  /** Submit séquentiel des events sélectionnés. L'image source est attachée
   *  au 1er event seulement (économie payload — c'est l'affiche unique). */
  const handleSubmitBatch = async () => {
    const toSubmit = Array.from(selected).sort((a, b) => a - b).map(i => events[i])
    if (toSubmit.length === 0) return
    setLoading(true)
    setError(null)
    setSubmitProgress(0)
    const { data: { session } } = await supabase.auth.getSession()
    const results: SubmitResult[] = []
    for (let i = 0; i < toSubmit.length; i++) {
      const evt = toSubmit[i]
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const imgB64  = evt.image_base64 ?? (i === 0 ? image : null)
        const imgMime = evt.image_base64 ? evt.image_mime : imageMimeType
        const res = await fetch('/api/evenements', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            titre:        evt.titre,
            description:  evt.description,
            date_debut:   evt.date_debut    || null,
            date_fin:     evt.date_fin      || null,
            heure:        evt.heure         || null,
            categorie:    evt.categorie,
            lieu_nom:     evt.lieu_nom      || null,
            commune:      evt.commune       || null,
            adresse:      evt.adresse       || null,
            lat:          evt.lat ?? undefined,
            lng:          evt.lng ?? undefined,
            place_id_google: evt.place_id_google,
            prix:         evt.prix          || null,
            contact:      evt.contact       || null,
            organisateurs: evt.organisateurs || null,
            image:        imgB64,
            imageMimeType: imgMime,
            image_position: evt.image_position,
            etablissement_id: etabId ?? undefined,
          }),
        })
        const d = await res.json()
        results.push({
          titre:  evt.titre || '(sans titre)',
          ok:     res.ok && !d.error,
          statut: d.statut || d.evenement?.statut,
          message: d.message,
        })
      } catch {
        results.push({ titre: evt.titre || '(sans titre)', ok: false })
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

  const removeEvent = (i: number) => {
    setEvents(prev => prev.filter((_, j) => j !== i))
    setSelected(prev => {
      const next = new Set<number>()
      prev.forEach(j => {
        if (j < i)       next.add(j)
        else if (j > i)  next.add(j - 1)
      })
      return next
    })
  }

  const handleManualOpen = () => {
    if (!user) { openAuthModal(); return }
    setForm(emptyForm)
    setStep('manual')
  }

  const resetImage = () => {
    setImage(null)
    setImagePreviewUrl(null)
    setImagePosition('50% 50%')
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  const resetAll = () => {
    setStep('input')
    setTexte('')
    setForm(emptyForm)
    resetImage()
    setSubmitMessage(undefined)
    setEventId(null)
    setError(null)
    setEvents([])
    setSelected(new Set())
    setEditingIndex(null)
    setSubmitProgress(0)
    setSubmitResults([])
  }

  // ── Cadrage photo (rectangle utile, plus de point focal) ───────────────────
  if (step === 'crop' && imagePreviewUrl) {
    return (
      <CropRect
        src={imagePreviewUrl}
        position={imagePosition}
        aspect={3}
        title="Cadrer l'affiche"
        hint="Touche pour déplacer la zone visible. Le cadre blanc = ce que les autres verront."
        onCancel={() => setStep('input')}
        onConfirm={(p) => { setImagePosition(p); setStep('input') }}
      />
    )
  }

  // ── Mode "à la main" : EventEditDrawer avec form vide ──────────────────────
  if (step === 'manual') {
    return (
      <EventEditDrawer
        initialData={manualInitial}
        initialImage={null}
        etablissementId={etabId}
        onClose={() => setStep('input')}
        onSaved={(result) => {
          setEventId(result?.id ?? null)
          setSubmitMessage(result?.message)
          setStep('success')
        }}
      />
    )
  }

  // ── Sélection multi-events (extraction IA → plusieurs events détectés) ────
  if (step === 'selection') {
    const cats = CATEGORIES as Record<string, { label: string; emoji: string; color: string }>
    const allSelected = selected.size === events.length && events.length > 0

    return (
      <div className="min-h-[100dvh] bg-creme pb-32 font-inter text-texte">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-bord bg-creme/95 px-4 py-3 backdrop-blur">
          <button
            onClick={() => setStep('input')}
            aria-label="Retour"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
              {events.length} événement{events.length > 1 ? 's' : ''} détecté{events.length > 1 ? 's' : ''}
            </div>
            <div className="mt-0.5 text-[11px] text-texte-doux">
              Coche ceux à publier, modifie ou supprime
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelected(allSelected ? new Set() : new Set(events.map((_, i) => i)))}
            className="shrink-0 bg-transparent px-1 py-2 text-[11px] font-bold text-primary underline"
          >
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>

        <div className="space-y-2 px-4 pt-3">
          {imagePreviewUrl && (
            <div className="mb-3 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreviewUrl} alt="Source" className="max-h-40 w-full object-cover" style={{ objectPosition: imagePosition }} />
            </div>
          )}

          {events.map((evt, i) => {
            const cat  = cats[evt.categorie] ?? cats['autre']
            const isOn = selected.has(i)
            return (
              <div
                key={i}
                onClick={() => toggleSelect(i)}
                className="cursor-pointer rounded-2xl bg-white p-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)] transition-colors"
                style={{ border: isOn ? '1.5px solid #2D5A3D' : '1px solid #F0EAE0' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
                    style={{ background: isOn ? '#2D5A3D' : 'transparent', borderColor: isOn ? '#2D5A3D' : '#E8E0D5' }}
                  >
                    {isOn && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.04em] text-white"
                        style={{ background: cat.color }}
                      >
                        {cat.emoji} {cat.label}
                      </span>
                    </div>
                    <p className="m-0 text-[14px] font-bold leading-snug text-texte">{evt.titre}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {evt.date_debut && (
                        <span className="text-[11px] font-semibold text-primary">
                          {new Date(evt.date_debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}
                        </span>
                      )}
                      {(evt.lieu_nom || evt.commune) && (
                        <span className="text-[11px] text-texte-doux">📍 {evt.lieu_nom || evt.commune}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setEditingIndex(i); setStep('edit-one') }}
                      aria-label="Modifier"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-bord bg-white text-texte"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeEvent(i) }}
                      aria-label="Supprimer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-bord bg-white text-[#B53A22]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <p className="mx-4 mt-3 rounded-xl border px-3 py-2 text-[12px] text-[#B53A22]" style={{ borderColor: '#F5C8A8', background: '#FBE9E5' }}>
            {error}
          </p>
        )}

        {/* CTA sticky bas */}
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white p-3.5" style={{ borderColor: '#EDE8E0' }}>
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-2 w-full rounded-full bg-cremeDeep">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${selected.size ? (submitProgress / selected.size) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[12px] text-texte-doux">{submitProgress} / {selected.size} envoyés…</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmitBatch}
              disabled={selected.size === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-none bg-primary text-[14px] font-bold text-white disabled:opacity-50"
            >
              Soumettre {selected.size} événement{selected.size > 1 ? 's' : ''}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="13 6 19 12 13 18"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Édition d'UN event extrait (mode in-memory, pas de POST API) ─────────
  if (step === 'edit-one' && editingIndex != null) {
    const draft = events[editingIndex]
    if (!draft) { setStep('selection'); return null }
    return (
      <EventEditDrawer
        initialData={{
          titre: draft.titre,
          description: draft.description,
          date_debut: draft.date_debut,
          date_fin: draft.date_fin,
          heure: draft.heure,
          categorie: draft.categorie,
          lieu_nom: draft.lieu_nom,
          commune: draft.commune,
          prix: draft.prix,
          contact: draft.contact,
          organisateurs: draft.organisateurs,
          adresse: draft.adresse,
          lat: draft.lat,
          lng: draft.lng,
          place_id_google: draft.place_id_google,
        }}
        initialImage={draft.image_base64 && draft.image_preview ? {
          base64: draft.image_base64,
          mime:   draft.image_mime,
          preview: draft.image_preview,
          position: draft.image_position,
        } : null}
        onClose={() => { setEditingIndex(null); setStep('selection') }}
        onEditOnly={(updated) => {
          setEvents(prev => prev.map((e, i) => i === editingIndex ? updated : e))
          setEditingIndex(null)
          setStep('selection')
        }}
      />
    )
  }

  // ── Preview (après extraction IA) ──────────────────────────────────────────
  if (step === 'preview') {
    return (
      <EventEditDrawer
        initialData={form}
        initialImage={image ? { base64: image, mime: imageMimeType, preview: imagePreviewUrl!, position: imagePosition } : null}
        etablissementId={etabId}
        onClose={() => setStep('input')}
        onSaved={(result) => {
          setEventId(result?.id ?? null)
          setSubmitMessage(result?.message)
          setStep('success')
        }}
      />
    )
  }

  // ── Succès ─────────────────────────────────────────────────────────────────
  if (step === 'success') {
    // Batch (multi-events) : affiche le récap ligne par ligne
    if (submitResults.length > 0) {
      const ok = submitResults.filter(r => r.ok).length
      const ko = submitResults.filter(r => !r.ok).length
      return (
        <div className="flex min-h-[100dvh] flex-col items-center bg-creme px-6 pt-12 pb-8 font-inter">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="m-0 mb-1.5 font-serif text-[26px] text-texte" style={{ letterSpacing: '-0.02em', fontWeight: 700 }}>
            Merci !
          </h2>
          <p className="m-0 mb-6 text-[13px] text-texte-doux">
            {ok} événement{ok > 1 ? 's' : ''} soumis{ko > 0 ? `, ${ko} erreur${ko > 1 ? 's' : ''}` : ''}
          </p>
          <div className="w-full max-w-[320px] space-y-1.5 rounded-2xl border bg-white p-3" style={{ borderColor: '#F0EAE0' }}>
            {submitResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: r.ok ? '#E8F2EB' : '#FBE9E5', color: r.ok ? '#2D5A3D' : '#B53A22' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {r.ok ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                  </svg>
                </span>
                <span className="flex-1 truncate text-[12px] text-texte">{r.titre}</span>
                {r.statut && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase"
                    style={{ background: r.statut === 'publie' ? '#E8F2EB' : '#FFF0E5', color: r.statut === 'publie' ? '#2D5A3D' : '#C84B2F', letterSpacing: '0.04em' }}
                  >
                    {r.statut === 'publie' ? 'Publié' : 'À valider'}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex w-full max-w-[280px] flex-col gap-2.5">
            <button
              onClick={resetAll}
              className="rounded-2xl border-[1.5px] border-primary bg-transparent py-3 text-[13px] font-bold text-primary"
            >
              Ajouter d&apos;autres événements
            </button>
            <Link href="/" className="text-center text-[12px] text-texte-doux underline">
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      )
    }

    // Single (preview / manual)
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
                onClick={resetAll}
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

  // ── Saisie principale (input) ──────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar */}
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

      {/* Hero intro */}
      <div className="px-4 pt-6">
        <h1
          className="m-0 font-serif text-[26px] leading-[1.1] text-texte"
          style={{ letterSpacing: '-0.02em', fontWeight: 700 }}
        >
          Capture-le, on s&apos;occupe du reste
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-texte-doux">
          Choisis ta méthode. L&apos;IA extrait titre, date, lieu, prix… tu vérifies, tu publies.
        </p>
        {etabCtx && (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#E8F2EB', border: '1px solid #C5DCC9' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>
            <p className="m-0 text-[12px] leading-tight text-texte">
              Publication pour <span className="font-bold">{etabCtx.nom}</span> — visible aussitôt sur votre fiche.
            </p>
          </div>
        )}
      </div>

      {/* File inputs cachés */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

      {/* ─── Card 1: Photo d'une affiche ─── */}
      <div className="px-4 pt-5">
        <div
          className="rounded-2xl bg-white p-3.5 shadow-[0_1px_4px_rgba(44,28,16,0.04)] transition-opacity"
          style={{
            border: mode === 'photo' ? '1.5px solid #2D5A3D' : '1px solid #F0EAE0',
            opacity: photoDisabled ? 0.45 : 1,
            pointerEvents: photoDisabled ? 'none' : 'auto',
          }}
        >
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-white">
                  AUTO
                </span>
                <span className="text-[11px] text-texte-doux">~ 5 sec</span>
              </div>
              <div className="text-[15px] font-extrabold leading-tight text-texte">Photo d&apos;une affiche</div>
              <div className="mt-0.5 text-[11px] text-texte-doux">On lit l&apos;image et on remplit toutes les infos.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handlePhotoClick('camera')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cremeDeep py-2.5 text-[12px] font-bold text-texte"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Prendre une photo
            </button>
            <button
              type="button"
              onClick={() => handlePhotoClick('gallery')}
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
                <img
                  src={imagePreviewUrl}
                  alt="preview"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: imagePosition }}
                />
                <button
                  type="button"
                  onClick={() => setStep('crop')}
                  className="absolute inset-0 flex items-center justify-center bg-black/35"
                >
                  <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">
                    Modifier le cadrage
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={resetImage}
                aria-label="Supprimer la photo"
                className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte-doux"
              >
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

      {/* ─── Card 2: Écrire / coller / dicter (micro intégré) ─── */}
      <div className="px-4">
        <div
          className="rounded-2xl bg-white p-3.5 shadow-[0_1px_4px_rgba(44,28,16,0.04)] transition-opacity"
          style={{
            border: mode === 'text' ? '1.5px solid #2D5A3D' : '1px solid #F0EAE0',
            opacity: textDisabled ? 0.45 : 1,
            pointerEvents: textDisabled ? 'none' : 'auto',
          }}
        >
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#3A5BC7]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-[#3A5BC7] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-white">
                  AUTO
                </span>
              </div>
              <div className="text-[15px] font-extrabold leading-tight text-texte">Écrire, coller ou dicter</div>
              <div className="mt-0.5 text-[11px] text-texte-doux">
                SMS, message WhatsApp, ou parle au micro &nbsp;
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline align-text-bottom">
                  <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Zone textarea + bouton micro intégré (ouvre DicteeModal Whisper) */}
          <div className="relative rounded-xl bg-cremeDeep p-3">
            <textarea
              ref={textareaRef}
              value={texte}
              onChange={e => setTexte(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="Concert de jazz samedi 12 avril à 20h à la salle des fêtes de Ganges. Entrée 8€. Contact : 06 12 34 56 78"
              className="block w-full resize-none border-none bg-transparent pr-12 text-[13px] leading-[1.5] text-texte outline-none placeholder:text-texte-tres-doux"
              style={{ minHeight: 90 }}
            />
            {/* Micro intégré en bottom-right — ouvre la modal dictée Whisper */}
            <button
              type="button"
              onClick={handleMicClick}
              aria-label="Dicter à la voix"
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
              style={{
                background: '#fff',
                borderColor: '#E8E0D4',
                color: '#C84B2F',
                boxShadow: '0 1px 3px rgba(44,28,16,0.06)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            </button>
          </div>

          {/* Hint + counter */}
          <div className="mt-2 flex items-center justify-between text-[11px] text-texte-doux">
            <span>Tu choisiras la photo après extraction.</span>
            <span>{texte.length}/2000</span>
          </div>
        </div>
      </div>

      {/* ─── Divider OU ─── */}
      <div className="flex items-center justify-center px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-texte-tres-doux">OU</span>
      </div>

      {/* ─── Card 3: Renseigner à la main (gratuit, ouvre EventEditDrawer) ─── */}
      <div className="px-4">
        <button
          type="button"
          onClick={handleManualOpen}
          className="flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
          style={{ borderColor: '#F0EAE0' }}
        >
          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[#FFF7E5] text-[#B8860B]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold leading-tight text-texte">Renseigner à la main</div>
            <div className="mt-0.5 text-[11px] text-texte-doux">
              Sans IA — remplis le formulaire toi-même (gratuit, sans limite).
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-tres-doux">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </button>
      </div>

      {error && (
        <div className="px-4 pt-3.5">
          <p className="m-0 rounded-xl border bg-[#FBE9E5] px-3.5 py-3 text-[13px] text-[#B53A22]" style={{ borderColor: '#F5C8A8' }}>
            {error}
          </p>
        </div>
      )}

      {/* Sticky CTA "Extraire les infos" — seul déclencheur IA, désactivé si idle */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white p-3.5" style={{ borderColor: '#EDE8E0' }}>
        <button
          type="button"
          onClick={handleAnalyse}
          disabled={loading || mode === 'idle'}
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

      {/* Modal dictée vocale (Whisper) — append le résultat au textarea */}
      {dicteeOpen && (
        <DicteeModal
          onClose={() => setDicteeOpen(false)}
          onTranscript={t => setTexte(prev => {
            const sep = prev && !prev.endsWith(' ') ? ' ' : ''
            return (prev + sep + t).slice(0, 2000)
          })}
        />
      )}
    </div>
  )
}
