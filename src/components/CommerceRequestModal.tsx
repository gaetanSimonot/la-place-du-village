'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

type Kind = 'commerce' | 'producteur'

const COMMERCE_TYPES = [
  { id: 'restaurant_bar',    label: 'Restaurant / Bar / Café', emoji: '🍴' },
  { id: 'hebergement',       label: 'Hébergement',              emoji: '🏨' },
  { id: 'artisan_service',   label: 'Artisan / Service',        emoji: '🛠️' },
  { id: 'sante_bien_etre',   label: 'Santé / Bien-être',        emoji: '💆' },
  { id: 'activite',          label: 'Activité / Loisir',        emoji: '🎯' },
]

const PRODUCT_CATS = [
  { id: 'fruits_legumes',    label: 'Fruits & légumes',  emoji: '🥬' },
  { id: 'viandes',           label: 'Viandes',           emoji: '🥩' },
  { id: 'fromages_laitages', label: 'Fromages & laitages', emoji: '🧀' },
  { id: 'oeufs',             label: 'Œufs',              emoji: '🥚' },
  { id: 'pain',              label: 'Pain & viennoiserie', emoji: '🥖' },
  { id: 'miel',              label: 'Miel & ruches',     emoji: '🍯' },
  { id: 'panier',            label: 'Paniers AMAP',      emoji: '🧺' },
  { id: 'plantes',           label: 'Plantes / pépinière', emoji: '🌱' },
  { id: 'huiles',            label: 'Huiles',            emoji: '🫒' },
  { id: 'boissons',          label: 'Boissons',          emoji: '🍷' },
  { id: 'artisanat',         label: 'Artisanat',         emoji: '🪡' },
  { id: 'autre',             label: 'Autre',             emoji: '✨' },
]

interface Prediction {
  place_id: string
  description: string
  main: string
  secondary: string
}

interface DbMatch {
  kind: 'etablissement' | 'producteur'
  id: string
  nom: string
  commune: string | null
  adresse?: string | null
  type?: string | null
  claimed: boolean
}

interface SubmitResult {
  auto_published?: boolean
  already_exists?: boolean
  etablissement_id?: string
  producer_id?: string
  kind: Kind
}

export default function CommerceRequestModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [kind, setKind]       = useState<Kind | null>(null)
  const [result, setResult]   = useState<SubmitResult | null>(null)

  // Auth gate : si pas log → on ouvre AuthModal au mount et on ferme cette modale
  useEffect(() => {
    if (!user) { onClose(); openAuthModal() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (!user) return null

  return (
    <>
      <style>{`
        .pdv-ref-modal input,
        .pdv-ref-modal textarea {
          color: #2C1810 !important;
          -webkit-text-fill-color: #2C1810 !important;
          background-color: transparent !important;
          caret-color: #2C1810 !important;
        }
        .pdv-ref-modal input::placeholder,
        .pdv-ref-modal textarea::placeholder {
          color: #B0A898 !important;
          -webkit-text-fill-color: #B0A898 !important;
          opacity: 1;
        }
        /* Force visibilité textes prédictions Google (cards) — anti dark-mode UA */
        .pdv-ref-modal .pdv-pred-card,
        .pdv-ref-modal .pdv-pred-card * {
          color: #1A1209 !important;
          -webkit-text-fill-color: #1A1209 !important;
        }
        .pdv-ref-modal .pdv-pred-card .pdv-pred-sub {
          color: #7A6A5A !important;
          -webkit-text-fill-color: #7A6A5A !important;
        }
      `}</style>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(3px)' }} />
      <div
        className="pdv-ref-modal"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
          backgroundColor: '#fff', borderRadius: '24px 24px 0 0',
          padding: '14px 20px 32px', fontFamily: 'var(--font-body), sans-serif',
          maxHeight: '92dvh', overflowY: 'auto',
        }}>
        <div style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#E4DED2', margin: '0 auto 14px' }} />

        {result ? (
          <SuccessView result={result} onClose={onClose} />
        ) : kind === null ? (
          <KindPicker onPick={setKind} />
        ) : (
          <ReferenceForm
            kind={kind}
            onBack={() => setKind(null)}
            onClose={onClose}
            onDone={(data) => setResult({ ...data, kind })}
          />
        )}
      </div>
    </>
  )
}

function KindPicker({ onPick }: { onPick: (k: Kind) => void }) {
  return (
    <>
      <h2
        style={{
          margin: '0 0 4px',
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: 22, fontWeight: 400, color: '#1A1209',
          letterSpacing: '-0.01em',
        }}
      >
        Référencer
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#7A6A5A' }}>
        Que voulez-vous ajouter à La Place du Village&nbsp;?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => onPick('commerce')}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 14px', borderRadius: 14,
            backgroundColor: '#FFFFFF', border: '1px solid #F0EAE0',
            boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: '#F0EBE3', color: '#7C5C3B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l1-5h16l1 5"/>
              <path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/>
              <path d="M9 21V12h6v9"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209', lineHeight: 1.2 }}>Un commerce</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>
              Restaurant, hébergement, artisan, service…
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </button>

        <button
          onClick={() => onPick('producteur')}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 14px', borderRadius: 14,
            backgroundColor: '#FFFFFF', border: '1px solid #F0EAE0',
            boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: '#EAF3E6', color: '#5B8A4A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/>
              <path d="M2 21c0-3 1.85-5.36 5.08-6"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209', lineHeight: 1.2 }}>Un producteur local</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>
              Maraîcher, éleveur, apiculteur, vigneron…
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </button>
      </div>
    </>
  )
}

function ReferenceForm({
  kind, onBack, onClose, onDone,
}: {
  kind: Kind
  onBack: () => void
  onClose: () => void
  onDone: (data: { auto_published?: boolean; already_exists?: boolean; etablissement_id?: string; producer_id?: string }) => void
}) {
  const { isAdmin } = useAuth()
  const [nom, setNom]                 = useState('')
  const [type, setType]               = useState<string>('')
  const [producerCats, setProducerCats] = useState<string[]>([])
  const [adresse, setAdresse]         = useState('')
  const [commune, setCommune]         = useState('')
  const [lat, setLat]                 = useState<number | null>(null)
  const [lng, setLng]                 = useState<number | null>(null)
  const [placeId, setPlaceId]         = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [contact, setContact]         = useState('')
  const [siteWeb, setSiteWeb]         = useState('')
  const [horaires, setHoraires]       = useState('')
  const [photos, setPhotos]           = useState<string[]>([])
  const [message, setMessage]         = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [dbMatches, setDbMatches]     = useState<DbMatch[]>([])
  // Prédictions Google (commerce) sur la recherche de nom — ADMIN UNIQUEMENT
  const [googlePredictions, setGooglePredictions] = useState<Prediction[]>([])
  // Predictions pour le champ Adresse du form (Google addresses-only)
  const [addressPredictions, setAddressPredictions] = useState<Prediction[]>([])
  const [searching, setSearching]     = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Session token Google Places : régénéré à chaque nouvelle session de recherche
  // (= après chaque sélection ou nouveau focus). Permet de grouper les frappes
  // en 1 session facturée (Autocomplete devient gratuit, seul le Details payé).
  const sessionTokenRef = useRef<string>(crypto.randomUUID())

  // Top search :
  //  - user normal → DB only (dbonly=1), ZERO Google (économie facturation)
  //  - ADMIN → DB + recherche Google Places (commerces) pour préremplir une fiche
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setDbMatches([]); setGooglePredictions([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const url = isAdmin
        ? `/api/admin/autocomplete?q=${encodeURIComponent(searchQuery)}&sessiontoken=${sessionTokenRef.current}`
        : `/api/admin/autocomplete?q=${encodeURIComponent(searchQuery)}&dbonly=1`
      const r = await fetch(url, { headers: tk ? { Authorization: `Bearer ${tk}` } : {} }).catch(() => null)
      if (r && r.ok) {
        const d = await r.json()
        setDbMatches((d.db ?? []).slice(0, 5))
        setGooglePredictions(isAdmin ? (d.predictions ?? []).slice(0, 5) : [])
      }
      setSearching(false)
    }, 280)
    return () => clearTimeout(t)
  }, [searchQuery, isAdmin])

  // ADMIN : clic sur un résultat Google → Place Details (full) → préremplit la fiche
  async function selectGooglePlace(p: Prediction) {
    setSearchQuery(''); setDbMatches([]); setGooglePredictions([])
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const r = await fetch(`/api/admin/geocode?place_id=${encodeURIComponent(p.place_id)}&mode=full&sessiontoken=${sessionTokenRef.current}`, {
      headers: tk ? { Authorization: `Bearer ${tk}` } : {},
    }).catch(() => null)
    sessionTokenRef.current = crypto.randomUUID()
    if (!r || !r.ok) return
    const d = await r.json()
    if (d.nom)        setNom(d.nom)
    if (d.adresse)    setAdresse(d.adresse)
    if (d.commune)    setCommune(d.commune)
    if (d.lat != null) setLat(d.lat)
    if (d.lng != null) setLng(d.lng)
    setPlaceId(p.place_id)
    if (kind === 'commerce' && d.type_guess) setType(d.type_guess)
    if (d.phone)    setContact(d.phone)
    if (d.website)  setSiteWeb(d.website)
    if (d.horaires) setHoraires(d.horaires)
  }

  // Address autocomplete (form, Google addresses-only) — fixe lat/lng
  useEffect(() => {
    if (!adresse || adresse.length < 3 || placeId) { setAddressPredictions([]); return }
    const t = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const r = await fetch(`/api/admin/autocomplete?q=${encodeURIComponent(adresse)}&types=address&sessiontoken=${sessionTokenRef.current}`, {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      }).catch(() => null)
      if (r && r.ok) {
        const d = await r.json()
        setAddressPredictions((d.predictions ?? []).slice(0, 5))
      }
    }, 300)
    return () => clearTimeout(t)
  }, [adresse, placeId])

  async function selectAddress(p: Prediction) {
    setAdresse(p.description)
    setAddressPredictions([])
    // Place Details basic + same session token = facturé en bundle
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const r = await fetch(`/api/admin/geocode?place_id=${encodeURIComponent(p.place_id)}&mode=basic&sessiontoken=${sessionTokenRef.current}`, {
      headers: tk ? { Authorization: `Bearer ${tk}` } : {},
    }).catch(() => null)
    sessionTokenRef.current = crypto.randomUUID() // regen pour prochaine session
    if (!r || !r.ok) return
    const d = await r.json()
    if (d.lat != null) setLat(d.lat)
    if (d.lng != null) setLng(d.lng)
    if (d.commune)     setCommune(d.commune)
    if (d.adresse)     setAdresse(d.adresse)
    setPlaceId(p.place_id)
  }

  // Clic sur un match DB → navigate vers la fiche, ferme la modal
  function openDbMatch(m: DbMatch) {
    onClose()
    const path = m.kind === 'etablissement' ? `/etablissement/${m.id}` : `/producteur/${m.id}`
    window.location.href = path
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { setUploading(false); return }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${uid}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('reference-photos').upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('reference-photos').getPublicUrl(path)
    if (urlData?.publicUrl) setPhotos(prev => [...prev, urlData.publicUrl])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePhoto(url: string) {
    setPhotos(prev => prev.filter(p => p !== url))
  }

  async function submit() {
    if (!nom.trim()) { setError('Le nom est requis'); return }
    if (kind === 'commerce' && !type)               { setError('Sélectionnez une catégorie'); return }
    if (kind === 'producteur' && producerCats.length === 0) { setError('Sélectionnez au moins une catégorie'); return }
    if (!adresse.trim() || lat == null || lng == null) { setError('Choisissez une adresse dans la liste'); return }

    setSubmitting(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setError('Session expirée'); setSubmitting(false); return }

    const endpoint = kind === 'commerce' ? '/api/commerce-request' : '/api/producer-request'
    const payload: Record<string, unknown> = {
      nom:             nom.trim(),
      adresse:         adresse.trim(),
      commune,
      lat, lng,
      place_id_google: placeId,
      description:     description.trim() || null,
      contact:         contact.trim()     || null,
      site_web:        siteWeb.trim()     || null,
      horaires:        horaires.trim()    || null,
      photos,
      message:         message.trim()     || null,
    }
    if (kind === 'commerce')   payload.type = type
    if (kind === 'producteur') payload.produit_categories = producerCats

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'Erreur envoi')
      setSubmitting(false)
      return
    }
    const d = await r.json()
    onDone({
      auto_published:   d.auto_published,
      already_exists:   d.already_exists,
      etablissement_id: d.etablissement_id,
      producer_id:      d.producer_id,
    })
  }

  return (
    <>
      {/* Top bar V3 — back + serif title + Annuler */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <button
          onClick={onBack}
          aria-label="Retour"
          style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: '#fff', border: '1px solid #E8E0D4', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1209',
            boxShadow: '0 1px 2px rgba(44,28,16,0.04)', flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: 17, color: '#1A1209', letterSpacing: '-0.01em', lineHeight: 1.1,
          }}>
            {kind === 'commerce' ? 'Référencer un commerce' : 'Référencer un producteur'}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            flexShrink: 0, background: 'transparent', border: 'none',
            padding: '4px 4px', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, color: '#7A6A5A',
            fontFamily: 'inherit',
          }}
        >
          Annuler
        </button>
      </div>

      {/* Hero intro V3 — mockup typo */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          margin: 0,
          fontFamily: 'var(--font-display), Georgia, serif',
          fontSize: 28, lineHeight: 1.05, color: '#1A1209',
          letterSpacing: '-0.02em', fontWeight: 700,
        }}>
          {kind === 'commerce' ? 'Quel commerce ?' : 'Quel producteur ?'}
        </h1>
        <p style={{
          marginTop: 6, fontSize: 13, color: '#7A6A5A', lineHeight: 1.5,
        }}>
          Cherche d&apos;abord si la fiche existe déjà. Sinon, ajoute-la à la main.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* === Search input — DB only (cherche dans nos fiches existantes) === */}
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            backgroundColor: '#fff',
            border: `1.5px solid ${searchQuery.trim() ? '#2D5A3D' : '#E8E0D4'}`,
            borderRadius: 14, padding: '13px 14px',
            boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#1A1209' }}>
              <circle cx="11" cy="11" r="7"/>
              <line x1="16.5" y1="16.5" x2="21" y2="21"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={kind === 'commerce' ? 'Ex: Boulangerie du Village, Ganges' : 'Ex: Ferme du Mas Neuf, Sumène'}
              style={{
                flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent',
                fontSize: 14, fontWeight: 500,
                color: '#1A1209',
                WebkitTextFillColor: '#1A1209',
                fontFamily: 'inherit', minWidth: 0,
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              maxLength={60}
            />
          </div>
          {searching && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#7A6A5A' }}>Recherche…</p>}
        </div>

        {/* Matches DB — déjà sur l'app */}
        {dbMatches.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-primary">
              📍 Déjà sur l&apos;app ({dbMatches.length})
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#C5DCC9] bg-[#F0F7F2] shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
              {dbMatches.map((m, i) => (
                <button
                  key={`${m.kind}-${m.id}`}
                  type="button"
                  onClick={() => openDbMatch(m)}
                  className={`flex w-full cursor-pointer items-center gap-3 bg-transparent px-3.5 py-3 text-left text-texte ${i < dbMatches.length - 1 ? 'border-b border-[#C5DCC9]' : ''}`}
                  style={{ WebkitTextFillColor: '#1A1209' }}
                >
                  <div className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-base ${m.kind === 'producteur' ? 'bg-primary text-white' : 'bg-[#FDE8DF] text-[#C0440A]'}`}>
                    {m.kind === 'producteur' ? '🌿' : '🏪'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-texte" style={{ WebkitTextFillColor: '#1A1209' }}>{m.nom}</span>
                      {m.claimed && (
                        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.05em] text-primary">Géré</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-texte-doux" style={{ WebkitTextFillColor: '#7A6A5A' }}>
                      {m.kind === 'producteur' ? 'Producteur' : 'Commerce'}
                      {m.commune ? ` · ${m.commune}` : ''}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A8A6A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <polyline points="9 6 15 12 9 18"/>
                  </svg>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-texte-doux">
              Si la fiche existe déjà, clique pour la voir — pas besoin de la créer à nouveau.
            </p>
          </div>
        )}

        {/* === Résultats Google (ADMIN) — préremplit la fiche === */}
        {isAdmin && googlePredictions.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em]" style={{ color: '#A8770F' }}>
              🔎 Trouvé sur Google ({googlePredictions.length})
            </div>
            <div className="overflow-hidden rounded-2xl border shadow-[0_1px_4px_rgba(44,28,16,0.04)]" style={{ borderColor: '#ECD9AE', background: '#FBF6EC' }}>
              {googlePredictions.map((p, i) => (
                <button
                  key={p.place_id}
                  type="button"
                  onClick={() => selectGooglePlace(p)}
                  className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left"
                  style={{ background: 'transparent', border: 'none', borderBottom: i < googlePredictions.length - 1 ? '1px solid #ECD9AE' : 'none', WebkitTextFillColor: '#1A1209' }}
                >
                  <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-base" style={{ background: '#F3E6C8', color: '#A8770F' }}>📍</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold" style={{ color: '#1A1209', WebkitTextFillColor: '#1A1209' }}>{p.main || p.description}</div>
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: '#7A6A5A', WebkitTextFillColor: '#7A6A5A' }}>{p.secondary || ''}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A23F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <polyline points="9 6 15 12 9 18"/>
                  </svg>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-texte-doux">Clique pour préremplir la fiche depuis Google (nom, adresse, GPS, catégorie, contact…).</p>
          </div>
        )}

        {/* Pas dans la liste — invite à la saisie manuelle */}
        {searchQuery.trim().length >= 2 && (
          <button
            type="button"
            onClick={() => {
              // Pré-remplit le nom avec la recherche puis focus la zone formulaire
              if (searchQuery && !nom) setNom(searchQuery)
              const nomInput = document.querySelector<HTMLInputElement>('input[placeholder="Ex: Boulangerie du Village"]')
              nomInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              setTimeout(() => nomInput?.focus(), 300)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '13px 14px', borderRadius: 14,
              background: '#FDFAF5', border: '1px dashed #E5DDD2',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: '#fff', color: '#2D5A3D', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid #C5DCC9',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1209' }}>Pas dans la liste&nbsp;?</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </button>
        )}

        {/* === 2. Nom === */}
        <Field label="Nom *">
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Boulangerie du Village" style={INPUT} />
        </Field>

        {/* === 2.5 Adresse (avec autocomplete Google addresses → fixe lat/lng) === */}
        <Field label="Adresse *">
          <div style={{ position: 'relative' }}>
            <input
              value={adresse}
              onChange={e => {
                const v = e.target.value
                setAdresse(v)
                // Si user modifie après une sélection, on déverrouille pour permettre re-search
                if (placeId && v !== adresse) { setPlaceId(null); setLat(null); setLng(null) }
              }}
              placeholder="Ex: 12 rue de la Paix, Ganges"
              style={INPUT}
              autoComplete="off"
            />
            {placeId && lat != null && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#2D5A3D', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Adresse localisée — coordonnées GPS fixées
              </p>
            )}
            {addressPredictions.length > 0 && !placeId && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
                background: '#fff', border: '1px solid #F0EAE0', borderRadius: 12,
                boxShadow: '0 4px 16px rgba(44,28,16,0.12)', overflow: 'hidden',
              }}>
                {addressPredictions.map((p, i) => (
                  <button
                    key={p.place_id}
                    type="button"
                    onClick={() => selectAddress(p)}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: '#fff', border: 'none',
                      borderBottom: i < addressPredictions.length - 1 ? '1px solid #F0EAE0' : 'none',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      color: '#1A1209',
                      WebkitTextFillColor: '#1A1209',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', WebkitTextFillColor: '#1A1209' }}>{p.main || p.description}</div>
                      <div style={{ fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', WebkitTextFillColor: '#7A6A5A' }}>{p.secondary || ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        {/* === 3. Catégorie === */}
        {kind === 'commerce' ? (
          <Field label="Catégorie *">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {COMMERCE_TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => setType(t.id)} style={catBtnStyle(type === t.id)}>
                  <span>{t.emoji}</span>{t.label}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Catégories *">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {PRODUCT_CATS.map(c => {
                const active = producerCats.includes(c.id)
                return (
                  <button key={c.id} type="button"
                    onClick={() => setProducerCats(prev => active ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                    style={catBtnStyle(active)}>
                    <span>{c.emoji}</span>{c.label}
                  </button>
                )
              })}
            </div>
          </Field>
        )}

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="Décrivez l'activité, l'ambiance, les spécialités…"
            style={{ ...INPUT, resize: 'vertical' }} maxLength={1000} />
        </Field>

        <Field label="Contact (tél ou email)">
          <input value={contact} onChange={e => setContact(e.target.value)} placeholder="06 12 34 56 78 ou bonjour@…" style={INPUT} />
        </Field>

        <Field label="Site web">
          <input value={siteWeb} onChange={e => setSiteWeb(e.target.value)} placeholder="https://…" style={INPUT} />
        </Field>

        <Field label="Horaires">
          <input value={horaires} onChange={e => setHoraires(e.target.value)} placeholder="Ex: Mar-Sam 9h-19h" style={INPUT} />
        </Field>

        <Field label={`Photos${photos.length > 0 ? ` (${photos.length})` : ''}`} hint="Optionnel">
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {photos.map(url => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} />
                  <button type="button" onClick={() => removePhoto(url)} style={{
                    position: 'absolute', top: -5, right: -5,
                    width: 20, height: 20, borderRadius: '50%',
                    backgroundColor: '#C0392B', color: '#fff', border: 'none',
                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 999,
            backgroundColor: '#FDFAF6', border: '1.5px dashed #2D5A3D',
            color: '#2D5A3D', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            📷 {uploading ? 'Upload…' : 'Ajouter une photo'}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </Field>

        <Field label="Message pour l'équipe (optionnel)">
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
            placeholder="Précisions, demande spéciale…"
            style={{ ...INPUT, resize: 'vertical' }} maxLength={500} />
        </Field>

        {error && (
          <p style={{
            padding: '10px 12px', borderRadius: 10,
            backgroundColor: '#FEF2F2', color: '#C0392B',
            fontSize: 12, fontWeight: 600, textAlign: 'center', margin: 0,
          }}>{error}</p>
        )}

        <button
          onClick={submit}
          disabled={submitting || uploading}
          style={{
            padding: '14px', borderRadius: 16, border: 'none',
            backgroundColor: submitting || uploading ? '#D8D0C8' : '#2D5A3D',
            color: '#fff', fontWeight: 800, fontSize: 14,
            cursor: submitting || uploading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {submitting ? 'Envoi…' : '✓ Soumettre pour validation'}
        </button>
        <p style={{ margin: 0, fontSize: 10, color: '#9A8A7A', textAlign: 'center', }}>
          Votre demande sera relue par l&apos;équipe avant publication.
        </p>
      </div>
    </>
  )
}

function SuccessView({ result, onClose }: { result: SubmitResult; onClose: () => void }) {
  const ficheUrl = result.kind === 'commerce' && result.etablissement_id
    ? `/etablissement/${result.etablissement_id}`
    : result.kind === 'producteur' && result.producer_id
      ? `/producteur/${result.producer_id}`
      : null

  const isAutoPublished = !!result.auto_published
  const isExisting      = !!result.already_exists
  const isPending       = !isAutoPublished && !isExisting

  const emoji = isAutoPublished ? '🎉' : isExisting ? 'ℹ️' : '✅'
  const title = isAutoPublished ? 'Fiche publiée !' : isExisting ? 'Cette fiche existe déjà' : 'Demande envoyée !'
  const sub = isAutoPublished
    ? 'Les infos Google ont permis une publication immédiate. Vous pouvez consulter la fiche maintenant.'
    : isExisting
      ? 'Cette fiche est déjà référencée sur la plateforme. Consultez-la ou revendiquez-la si elle vous appartient.'
      : 'Notre équipe relit votre demande. Dès qu\'elle est validée, la fiche apparaîtra dans l\'app et vous recevrez une notification.'

  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>{emoji}</div>
      <p style={{ fontWeight: 900, fontSize: 18, color: '#1C1917', margin: '0 0 8px' }}>{title}</p>
      <p style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.6, margin: '0 0 24px', }}>
        {sub}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {ficheUrl && !isPending && (
          <a href={ficheUrl} style={{
            padding: '13px 22px', borderRadius: 999,
            backgroundColor: '#2D5A3D', color: '#fff',
            fontWeight: 800, fontSize: 14, textDecoration: 'none',
            fontFamily: 'inherit',
          }}>Voir la fiche →</a>
        )}
        <button onClick={onClose} style={{
          padding: '13px 22px', borderRadius: 999,
          backgroundColor: ficheUrl && !isPending ? '#F0EAE0' : '#2D5A3D',
          color: ficheUrl && !isPending ? '#6B5E4E' : '#fff',
          border: 'none', fontWeight: 800, fontSize: 14,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Fermer</button>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5E4E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
        {hint && <span style={{ fontSize: 10, color: '#9A8A7A', fontStyle: 'italic' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const INPUT: React.CSSProperties = {
  display: 'block', width: '100%',
  padding: '10px 14px', borderRadius: 12,
  border: '1.5px solid #E0D8CE',
  fontSize: 14, fontFamily: 'var(--font-body), sans-serif',
  outline: 'none', boxSizing: 'border-box',
  color: '#2C1810', backgroundColor: '#FDFAF6',
  // Force la couleur du texte sur iOS/Safari/Chrome autofill et dans le PWA
  // où certains user-agents posent un thème "system" qui rend le texte invisible.
  WebkitTextFillColor: '#2C1810',
  colorScheme: 'light',
}

function catBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '9px 10px', borderRadius: 10,
    border: active ? '1.5px solid #2D5A3D' : '1.5px solid #E0D8CE',
    backgroundColor: active ? '#E8F2EB' : '#fff',
    color: active ? '#2D5A3D' : '#1A1209',
    fontSize: 11, fontWeight: active ? 800 : 600,
    cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
    textAlign: 'left',
  }
}
