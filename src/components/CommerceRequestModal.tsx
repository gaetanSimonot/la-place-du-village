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
  main_text: string
  secondary_text: string
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
          background-color: #FDFAF6 !important;
          caret-color: #2C1810 !important;
        }
        .pdv-ref-modal input::placeholder,
        .pdv-ref-modal textarea::placeholder {
          color: #B0A898 !important;
          -webkit-text-fill-color: #B0A898 !important;
          opacity: 1;
        }
      `}</style>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(3px)' }} />
      <div
        className="pdv-ref-modal"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
          backgroundColor: '#fff', borderRadius: '24px 24px 0 0',
          padding: '14px 20px 32px', fontFamily: 'Inter, sans-serif',
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

  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching]     = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [, setGooglePhotos] = useState<string[]>([])
  const [autoFilled, setAutoFilled]   = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Autocomplete debounce
  useEffect(() => {
    if (!adresse || adresse.length < 3 || placeId) { setPredictions([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const r = await fetch(`/api/admin/autocomplete?q=${encodeURIComponent(adresse)}`).catch(() => null)
      if (r && r.ok) {
        const d = await r.json()
        setPredictions((d.predictions ?? []).slice(0, 5))
      }
      setSearching(false)
    }, 280)
    return () => clearTimeout(t)
  }, [adresse, placeId])

  async function selectPrediction(p: Prediction) {
    setAdresse(p.description)
    setPredictions([])
    const r = await fetch(`/api/admin/geocode?place_id=${encodeURIComponent(p.place_id)}`).catch(() => null)
    if (!r || !r.ok) { setPlaceId(p.place_id); return }
    const d = await r.json()
    if (d.lat != null) setLat(d.lat)
    if (d.lng != null) setLng(d.lng)
    if (d.commune)     setCommune(d.commune)
    if (d.adresse)     setAdresse(d.adresse)

    // Auto-fill : Google prime puisque l'adresse est cherchée en premier.
    // Si l'user avait tapé un truc avant, on l'écrase (il pourra rééditer après).
    const filled: string[] = []
    if (kind === 'commerce' && d.nom)         { setNom(d.nom);          filled.push('nom') }
    if (kind === 'commerce' && d.type_guess)  { setType(d.type_guess);  filled.push('catégorie') }
    if (d.phone)                              { setContact(d.phone);    filled.push('téléphone') }
    if (d.website)                            { setSiteWeb(d.website);  filled.push('site web') }
    if (d.horaires)                           { setHoraires(d.horaires); filled.push('horaires') }
    setAutoFilled(filled)

    // Photos Google : on les ajoute direct dans photos[] (elles peuvent être
    // retirées via la croix si l'user veut). Si la fiche est créée non
    // revendiquée, elles restent visibles ; quand le commerce revendique, il
    // peut les remplacer par les siennes via le bouton ✏️ Éditer.
    if (Array.isArray(d.photo_refs) && d.photo_refs.length > 0) {
      const urls = d.photo_refs.map((ref: string) => `/api/google-place-photo?ref=${encodeURIComponent(ref)}&maxwidth=800`)
      setPhotos(prev => Array.from(new Set([...prev, ...urls])))
      setGooglePhotos([])
      filled.push(`${urls.length} photo${urls.length > 1 ? 's' : ''}`)
      setAutoFilled(filled)
    }

    setPlaceId(p.place_id)
  }

  function resetAddress() {
    setLat(null); setLng(null); setPlaceId(null); setCommune('')
    setGooglePhotos([])
    setAutoFilled([])
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
            fontFamily: 'var(--font-dm-serif), Georgia, serif',
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
          fontFamily: 'var(--font-dm-serif), Georgia, serif',
          fontSize: 28, lineHeight: 1.05, color: '#1A1209',
          letterSpacing: '-0.02em', fontWeight: 700,
        }}>
          {kind === 'commerce' ? 'Quel commerce ?' : 'Quel producteur ?'}
        </h1>
        <p style={{
          marginTop: 6, fontSize: 13, color: '#7A6A5A', lineHeight: 1.5,
        }}>
          Tape le nom — on cherche dans Google Maps pour pré-remplir adresse et horaires.
          Sinon, tu peux saisir manuellement.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* === Search input V3 (border 1.5 primary) === */}
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            backgroundColor: '#fff',
            border: `1.5px solid ${adresse.trim() ? '#2D5A3D' : '#E8E0D4'}`,
            borderRadius: 14, padding: '13px 14px',
            boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#1A1209' }}>
              <circle cx="11" cy="11" r="7"/>
              <line x1="16.5" y1="16.5" x2="21" y2="21"/>
            </svg>
            <input
              value={adresse}
              onChange={e => { setAdresse(e.target.value); if (placeId) resetAddress() }}
              placeholder={kind === 'commerce' ? 'Ex: Boulangerie du Village, Ganges' : 'Ex: Ferme du Mas Neuf, Sumène'}
              style={{
                flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent',
                fontSize: 14, fontWeight: 500, color: '#1A1209',
                fontFamily: 'inherit', minWidth: 0,
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              maxLength={60}
            />
            {adresse && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#7A6A5A',
                backgroundColor: '#F7F1E6', padding: '3px 7px', borderRadius: 6,
                flexShrink: 0,
              }}>{adresse.length}/60</span>
            )}
          </div>
          {placeId && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#2D5A3D', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Adresse localisée{commune ? ` · ${commune}` : ''}
            </p>
          )}
          {autoFilled.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#3A5BC7', fontWeight: 700 }}>
              Pré-rempli depuis Google : {autoFilled.join(', ')}
            </p>
          )}
          {searching && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#7A6A5A' }}>Recherche…</p>}
        </div>

        {/* Predictions V3 (cards avec IcStore en cremeDeep cercle) */}
        {predictions.length > 0 && !placeId && (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#7A6A5A',
              letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase',
            }}>Suggestions proches</div>
            <div style={{
              backgroundColor: '#fff', border: '1px solid #F0EAE0',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
            }}>
              {predictions.map((p, i) => (
                <button
                  key={p.place_id}
                  type="button"
                  onClick={() => selectPrediction(p)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    borderBottom: i < predictions.length - 1 ? '1px solid #F0EAE0' : 'none',
                    textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    backgroundColor: '#F7F1E6', color: '#7A6A5A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l1-5h16l1 5"/>
                      <path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/>
                      <path d="M9 21V12h6v9"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.main_text}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.secondary_text}</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="9 6 15 12 9 18"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pas dans la liste — invite à la saisie manuelle */}
        {!placeId && adresse.trim().length >= 2 && (
          <button
            type="button"
            onClick={() => {
              // Focus le champ Nom pour saisie manuelle
              setNom(adresse)
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
              <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>Saisis les infos toi-même</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </button>
        )}

        {/* Notice 2 cas V3 : Google trouvé vs Saisie manuelle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Cas 1 — Trouvé sur Google → publi directe */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 12,
            background: placeId ? '#E8F2EB' : '#F7F1E6',
            border: `1px solid ${placeId ? '#C5DCC9' : '#F0EAE0'}`,
            opacity: placeId ? 1 : 0.7,
            transition: 'all 0.18s',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: '#2D5A3D', color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#2D5A3D', letterSpacing: '-0.01em' }}>
                Trouvé sur Google
              </div>
              <div style={{ fontSize: 11, color: '#5A8A6A', marginTop: 2, lineHeight: 1.4 }}>
                La fiche est ajoutée directement sur la carte.
              </div>
            </div>
          </div>
          {/* Cas 2 — Saisie manuelle → modéré ~1 jour */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 12,
            background: !placeId ? '#FFF0E5' : '#F7F1E6',
            border: `1px solid ${!placeId ? '#F5D0B5' : '#F0EAE0'}`,
            opacity: !placeId ? 1 : 0.7,
            transition: 'all 0.18s',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: '#C84B2F', color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#C84B2F', letterSpacing: '-0.01em' }}>
                Saisie manuelle
              </div>
              <div style={{ fontSize: 11, color: '#A8634F', marginTop: 2, lineHeight: 1.4 }}>
                Modéré avant publication — compte ~1 journée.
              </div>
            </div>
          </div>
        </div>

        {/* === 2. Nom (souvent rempli automatiquement) === */}
        <Field label="Nom *">
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Boulangerie du Village" style={INPUT} />
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
  fontSize: 14, fontFamily: 'Inter, sans-serif',
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
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    textAlign: 'left',
  }
}
