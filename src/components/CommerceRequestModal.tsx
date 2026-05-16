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

export default function CommerceRequestModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [kind, setKind]     = useState<Kind | null>(null)
  const [done, setDone]     = useState(false)

  // Auth gate : si pas log → on ouvre AuthModal au mount et on ferme cette modale
  useEffect(() => {
    if (!user) { onClose(); openAuthModal() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (!user) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
        padding: '24px 22px 40px', fontFamily: 'Inter, sans-serif',
        maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />

        {done ? (
          <SuccessView onClose={onClose} />
        ) : kind === null ? (
          <KindPicker onPick={setKind} />
        ) : (
          <ReferenceForm
            kind={kind}
            onBack={() => setKind(null)}
            onDone={() => setDone(true)}
          />
        )}
      </div>
    </>
  )
}

function KindPicker({ onPick }: { onPick: (k: Kind) => void }) {
  return (
    <>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#1C1917', textAlign: 'center', letterSpacing: '-0.02em' }}>
        Référencer
      </h2>
      <p style={{ margin: '0 0 22px', fontSize: 12, color: '#6B5E4E', textAlign: 'center', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
        Que voulez-vous ajouter à La Place du Village ?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={() => onPick('commerce')}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '18px 16px', borderRadius: 16,
            backgroundColor: '#FFF7EE', border: '1.5px solid #E8C99B',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 30 }}>🏪</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A1209' }}>Un commerce</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A6A5A' }}>
              Restaurant, hébergement, artisan, service…
            </p>
          </div>
          <span style={{ fontSize: 20, color: '#C4622D' }}>›</span>
        </button>

        <button
          onClick={() => onPick('producteur')}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '18px 16px', borderRadius: 16,
            backgroundColor: '#F0F7EE', border: '1.5px solid #B6D8AA',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 30 }}>🌱</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A1209' }}>Un producteur local</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A6A5A' }}>
              Maraîcher, éleveur, apiculteur, vigneron…
            </p>
          </div>
          <span style={{ fontSize: 20, color: '#2D5A3D' }}>›</span>
        </button>
      </div>
    </>
  )
}

function ReferenceForm({
  kind, onBack, onDone,
}: {
  kind: Kind
  onBack: () => void
  onDone: () => void
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
  const [googlePhotos, setGooglePhotos] = useState<string[]>([])
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

    // Auto-fill — uniquement si le champ est vide (on respecte ce que le user a tapé)
    const filled: string[] = []
    if (kind === 'commerce' && d.nom && !nom.trim())          { setNom(d.nom);          filled.push('nom') }
    if (kind === 'commerce' && d.type_guess && !type)         { setType(d.type_guess);  filled.push('catégorie') }
    if (d.phone && !contact.trim())                            { setContact(d.phone);    filled.push('téléphone') }
    if (d.website && !siteWeb.trim())                          { setSiteWeb(d.website);  filled.push('site web') }
    if (d.horaires && !horaires.trim())                        { setHoraires(d.horaires); filled.push('horaires') }
    setAutoFilled(filled)

    // Photos Google proposées (preview)
    if (Array.isArray(d.photo_refs) && d.photo_refs.length > 0) {
      setGooglePhotos(d.photo_refs.map((ref: string) => `/api/google-place-photo?ref=${encodeURIComponent(ref)}&maxwidth=800`))
    }

    setPlaceId(p.place_id)
  }

  function resetAddress() {
    setLat(null); setLng(null); setPlaceId(null); setCommune('')
    setGooglePhotos([])
    setAutoFilled([])
  }

  function addAllGooglePhotos() {
    setPhotos(prev => Array.from(new Set([...prev, ...googlePhotos])))
    setGooglePhotos([])
  }

  function addOneGooglePhoto(url: string) {
    setPhotos(prev => prev.includes(url) ? prev : [...prev, url])
    setGooglePhotos(prev => prev.filter(p => p !== url))
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
    onDone()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: 10,
          backgroundColor: '#F8F4EE', border: 'none', cursor: 'pointer',
          fontSize: 16, color: '#2D5A3D', flexShrink: 0,
        }}>←</button>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1C1917' }}>
          {kind === 'commerce' ? '🏪 Référencer un commerce' : '🌱 Référencer un producteur'}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nom *">
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Boulangerie du Village" style={INPUT} />
        </Field>

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

        <Field label="Adresse ou nom du lieu *" hint="Google complète automatiquement les infos">
          <div style={{ position: 'relative' }}>
            <input
              value={adresse}
              onChange={e => { setAdresse(e.target.value); if (placeId) resetAddress() }}
              placeholder="Ex: Boulangerie du Village, Ganges"
              style={INPUT}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {predictions.length > 0 && !placeId && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                marginTop: 4, backgroundColor: '#fff',
                borderRadius: 12, border: '1px solid #E5DDD2',
                boxShadow: '0 6px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
              }}>
                {predictions.map(p => (
                  <button key={p.place_id} type="button" onClick={() => selectPrediction(p)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px', border: 'none', borderTop: '1px solid #F0EAE0',
                    backgroundColor: 'transparent', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A1209' }}>{p.main_text}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: '#7A6A5A' }}>{p.secondary_text}</p>
                  </button>
                ))}
              </div>
            )}
            {placeId && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#2D5A3D', fontWeight: 700 }}>
                ✓ Adresse localisée{commune ? ` · ${commune}` : ''}
              </p>
            )}
            {autoFilled.length > 0 && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#3A5BC7', fontWeight: 700 }}>
                ✨ Pré-rempli depuis Google : {autoFilled.join(', ')}
              </p>
            )}
            {searching && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#8A7A6A' }}>Recherche…</p>}
          </div>
        </Field>

        {/* Photos Google proposées */}
        {googlePhotos.length > 0 && (
          <Field label={`📷 ${googlePhotos.length} photo${googlePhotos.length > 1 ? 's' : ''} Google disponible${googlePhotos.length > 1 ? 's' : ''}`} hint="Cliquez pour ajouter">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {googlePhotos.map((url, i) => (
                <button key={i} type="button" onClick={() => addOneGooglePhoto(url)} style={{
                  position: 'relative', width: 72, height: 72, padding: 0,
                  borderRadius: 10, overflow: 'hidden',
                  border: '1.5px dashed #3A5BC7', cursor: 'pointer',
                  background: 'none',
                }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: 'rgba(58,91,199,0.85)', color: '#fff',
                    fontSize: 9, fontWeight: 800, padding: '2px 0',
                    textAlign: 'center',
                  }}>+ Ajouter</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={addAllGooglePhotos} style={{
              padding: '7px 12px', borderRadius: 999,
              backgroundColor: '#3A5BC7', color: '#fff',
              border: 'none', fontSize: 11, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Tout ajouter ({googlePhotos.length})</button>
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
        <p style={{ margin: 0, fontSize: 10, color: '#9A8A7A', textAlign: 'center', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
          Votre demande sera relue par l&apos;équipe avant publication.
        </p>
      </div>
    </>
  )
}

function SuccessView({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <p style={{ fontWeight: 900, fontSize: 18, color: '#1C1917', margin: '0 0 8px' }}>Demande envoyée !</p>
      <p style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.6, margin: '0 0 24px', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
        Notre équipe relit votre demande. Dès qu&apos;elle est validée, la fiche apparaîtra dans l&apos;app et vous recevrez une notification.
      </p>
      <button onClick={onClose} style={{
        padding: '13px 28px', borderRadius: 999,
        backgroundColor: '#2D5A3D', color: '#fff', border: 'none',
        fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
      }}>Fermer</button>
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
