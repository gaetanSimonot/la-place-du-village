'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHistoryTrap } from '@/contexts/HistoryTrapContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import {
  CATEGORIES_ANNONCES,
  CATEGORIES_LABELS,
  CATEGORIES_ICONS,
  getTypesAutorises,
  getDureeAnnonceJours,
  validateAnnonceInput,
  type Annonce,
  type AnnonceType,
  type AnnonceCategorie,
  type AnnonceCreateInput,
} from '@/lib/annonces'
import type { Plan } from '@/lib/capabilities'
import SubscriptionModal from '@/components/SubscriptionModal'

interface Props {
  initial?: Annonce | null
  onSuccess?: (annonceId: string) => void
}

const TYPE_INFO: Record<AnnonceType, { label: string; sub: string; color: string; bg: string; help: string; icon: React.ReactNode }> = {
  vente:            {
    label: 'Vente',   sub: 'À prix fixe',          color: '#1A1209', bg: '#FFFFFF',
    help: 'Prix fixe, contact direct.',
    icon: <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: '#1A1209' }}>€</span>,
  },
  don:              {
    label: 'Don',     sub: 'Gratuit',              color: '#2D5A3D', bg: '#E8F2EB',
    help: 'Gratuit, visible par tous.',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
  },
  troc:             {
    label: 'Troc',    sub: 'Échange contre…',      color: '#3A5BC7', bg: '#EEF3FF',
    help: 'Échange contre autre chose.',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3A5BC7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  },
  service:          {
    label: 'Service', sub: 'Coup de main, aide…',   color: '#2E7D74', bg: '#E6F2F0',
    help: 'Un service proposé ou recherché (bricolage, jardin, garde…). Accessible à tous les plans.',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E7D74" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  },
  enchere_inversee: {
    label: 'Enchère', sub: 'Le prix baisse / j',   color: '#C0392B', bg: '#FBE9E7',
    help: 'Le prix baisse chaque jour. Si personne ne prend avant le seuil, l\'annonce devient un don.',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  },
}

const MAX_PHOTOS = 3

export default function AnnonceForm({ initial, onSuccess }: Props) {
  const router = useRouter()
  const { user, profile } = useAuth()
  const plan = (profile?.plan as Plan) ?? 'basic'
  const typesAutorises = getTypesAutorises(plan)

  const [type, setType]                   = useState<AnnonceType>(initial?.type ?? typesAutorises[0])
  const [titre, setTitre]                 = useState(initial?.titre ?? '')
  const [description, setDescription]     = useState(initial?.description ?? '')
  const [categorie, setCategorie]         = useState<AnnonceCategorie>(initial?.categorie ?? 'autres')
  const [prixInitial, setPrixInitial]     = useState<string>(initial?.prix_initial?.toString() ?? '')
  const [prixSeuil, setPrixSeuil]         = useState<string>(initial?.prix_seuil?.toString() ?? '')
  const [tauxBaisse, setTauxBaisse]       = useState<string>(initial?.taux_baisse_pct?.toString() ?? '5')
  const [contactTel, setContactTel]       = useState(initial?.contact_tel ?? '')
  const [contactEmail, setContactEmail]   = useState(initial?.contact_email ?? '')
  const [ville, setVille]                 = useState(initial?.ville ?? '')
  const [photos, setPhotos]               = useState<string[]>(initial?.photos ?? [])
  const [remiseMP, setRemiseMP]           = useState<boolean>(initial?.remise_main_propre ?? true)
  const [uploading, setUploading]         = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade]     = useState(false)

  const cameraInputRef  = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // ── Dirty tracking + guard PWA (back involontaire en standalone) ──
  // On considère le form "dirty" dès que l'user a touché un champ texte ou
  // ajouté/retiré une photo, sauf juste après un submit réussi.
  const dirtyRef = useRef(false)
  const submittedRef = useRef(false)
  if (!submittedRef.current) {
    const baseTitre = initial?.titre ?? ''
    const baseDesc  = initial?.description ?? ''
    const baseVille = initial?.ville ?? ''
    const basePhotos = initial?.photos ?? []
    dirtyRef.current = (
      titre.trim() !== baseTitre.trim() ||
      description.trim() !== baseDesc.trim() ||
      ville.trim() !== baseVille.trim() ||
      photos.length !== basePhotos.length ||
      photos.some((p, i) => p !== basePhotos[i])
    )
  }
  const trap = useHistoryTrap()
  const { confirm } = useConfirm()
  useEffect(() => {
    return trap.registerGuard(async () => {
      if (!dirtyRef.current) return true
      const ok = await confirm({
        title: 'Quitter sans publier ?',
        message: 'Tes modifications ne seront pas enregistrées.',
        confirmLabel: 'Quitter',
        cancelLabel: 'Continuer',
        destructive: true,
      })
      return ok
    })
  }, [trap, confirm])

  async function handleUpload(files: FileList | null) {
    if (!files?.length || !user) return
    setUploading(true)
    setError(null)
    const newUrls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}-${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('annonces').upload(path, file, { upsert: false })
      if (upErr) {
        setError(`Erreur upload : ${upErr.message}`)
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('annonces').getPublicUrl(path)
      newUrls.push(publicUrl)
    }
    setPhotos(p => [...p, ...newUrls])
    setUploading(false)
  }

  function removePhoto(url: string) {
    setPhotos(p => p.filter(u => u !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const input: AnnonceCreateInput = {
      type,
      titre: titre.trim(),
      description: description.trim() || null,
      categorie,
      photos,
      prix_initial:    prixInitial ? Number(prixInitial) : null,
      prix_seuil:      prixSeuil   ? Number(prixSeuil)   : null,
      taux_baisse_pct: tauxBaisse  ? Number(tauxBaisse)  : null,
      contact_tel:     contactTel.trim() || null,
      contact_email:   contactEmail.trim() || null,
      ville:           ville.trim() || null,
      remise_main_propre: remiseMP,
    }

    const validationError = validateAnnonceInput(input, plan)
    if (validationError) { setError(validationError); return }

    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setError('Connectez-vous pour continuer'); setSubmitting(false); return }

    const url    = initial ? `/api/annonces/${initial.id}` : '/api/annonces'
    const method = initial ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error ?? 'Erreur')
      if (data.upgradeRequired) setShowUpgrade(true)
      return
    }

    const id = data.annonce?.id ?? initial?.id
    submittedRef.current = true   // désamorce le guard dirty pour la nav suivante
    dirtyRef.current = false
    if (onSuccess && id) onSuccess(id)
    else if (id) {
      // Si création (pas édition) → flag just_created pour proposer le boost
      const isCreation = !initial?.id
      router.push(`/annonces/${id}${isCreation ? '?just_created=1' : ''}`)
    }
  }

  const showPrix    = type === 'vente' || type === 'enchere_inversee'
  const showEnchere = type === 'enchere_inversee'
  const dureeJours  = getDureeAnnonceJours(plan)

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ─────────── TYPE D'ANNONCE 2x2 V3 ─────────── */}
      <Section title="Type d'annonce">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(['vente', 'don', 'troc', 'service', 'enchere_inversee'] as AnnonceType[]).map(t => {
            const allowed = typesAutorises.includes(t)
            const ti = TYPE_INFO[t]
            const active = type === t
            return (
              <button
                key={t}
                type="button"
                disabled={!allowed}
                onClick={() => setType(t)}
                title={!allowed ? `Plan ${plan} → upgrade requis` : ''}
                style={{
                  padding: '12px 14px', borderRadius: 14,
                  border: active ? `1.5px solid #1A1209` : '1px solid #F0EAE0',
                  backgroundColor: '#fff',
                  fontFamily: 'inherit',
                  cursor: allowed ? 'pointer' : 'not-allowed',
                  opacity: allowed ? 1 : 0.45,
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: ti.bg, color: ti.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {ti.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209', lineHeight: 1.2 }}>{ti.label}</div>
                  <div style={{ fontSize: 10, color: '#7A6A5A', marginTop: 2, lineHeight: 1.2 }}>{ti.sub}</div>
                </div>
              </button>
            )
          })}
        </div>
        {plan === 'basic' && type !== 'don' && (
          <p style={{ fontSize: 11, color: '#7A5614', margin: '6px 0 0', lineHeight: 1.5 }}>
            Plan Villageois : 3 annonces vente/troc/service/enchère par mois (dons illimités).{' '}
            <button
              type="button"
              onClick={() => setShowUpgrade(true)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#3A5BC7', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
            >
              Passer Habitants
            </button>
          </p>
        )}
      </Section>

      {/* ─────────── PHOTOS 3 slots V3 ─────────── */}
      <Section title="Photos" subtitle={`${MAX_PHOTOS} photos maximum, la 1ère est la principale`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[0, 1, 2].map(idx => {
            const url = photos[idx]
            if (url) {
              return (
                <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', backgroundColor: '#F0EBE3' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {idx === 0 && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6, zIndex: 2,
                      fontSize: 9, fontWeight: 800, color: '#fff',
                      background: '#1A1209', borderRadius: 4, padding: '2px 5px',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                      Principale
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    aria-label="Retirer la photo"
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 22, height: 22, borderRadius: '50%',
                      backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )
            }
            // Slot vide → bouton Ajouter
            return (
              <button
                key={idx}
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploading}
                style={{
                  aspectRatio: '1', borderRadius: 12,
                  border: '1px dashed #E5DDD2', background: '#FDFAF5',
                  cursor: uploading ? 'wait' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  color: '#7A6A5A',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Ajouter</span>
              </button>
            )
          })}
        </div>

        <input
          ref={cameraInputRef}
          type="file" accept="image/*" capture="environment"
          onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        <input
          ref={galleryInputRef}
          type="file" accept="image/*" multiple
          onChange={e => {
            const remaining = MAX_PHOTOS - photos.length
            const files = e.target.files
            if (files && remaining > 0) {
              const dt = new DataTransfer()
              for (let i = 0; i < Math.min(files.length, remaining); i++) dt.items.add(files[i])
              handleUpload(dt.files)
            }
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        {uploading && <p style={{ fontSize: 11, color: '#7A6A5A', margin: '6px 0 0' }}>Envoi en cours…</p>}
      </Section>

      {/* ─────────── Infos principales ─────────── */}
      <Section title="Description">
        <Field label="Titre">
          <input
            value={titre}
            onChange={e => setTitre(e.target.value)}
            maxLength={120}
            placeholder="Vélo électrique, état neuf"
            style={inputStyle}
            required
          />
        </Field>

        <Field label="Catégorie">
          <select value={categorie} onChange={e => setCategorie(e.target.value as AnnonceCategorie)} style={inputStyle}>
            {CATEGORIES_ANNONCES.map(c => (
              <option key={c} value={c}>{CATEGORIES_ICONS[c]} {CATEGORIES_LABELS[c]}</option>
            ))}
          </select>
        </Field>

        <Field label="Description (optionnel)">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="État, usage, détails… Donne de la précision pour vendre vite"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#7A6A5A' }}>
            <span>Donne de la précision pour vendre vite</span>
            <span>{description.length}/1000</span>
          </div>
        </Field>
      </Section>

      {/* ─────────── Prix ─────────── */}
      {showPrix && (
        <Section title={showEnchere ? 'Enchère inversée' : 'Prix'}>
          <Field label={showEnchere ? 'Prix de départ (€)' : 'Prix (€)'}>
            <input
              type="number" step="0.01" min="0"
              value={prixInitial}
              onChange={e => setPrixInitial(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </Field>

          {showEnchere && (
            <>
              <Field label="Taux de baisse quotidien (%)">
                <input
                  type="number" step="0.1" min="0.1" max="99"
                  value={tauxBaisse}
                  onChange={e => setTauxBaisse(e.target.value)}
                  placeholder="5"
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: '#8A7A6A', margin: '4px 0 0' }}>
                  Le prix actuel diminue de ce pourcentage chaque nuit à minuit.
                </p>
              </Field>
              <Field label="Seuil minimum (€) — optionnel">
                <input
                  type="number" step="0.01" min="0"
                  value={prixSeuil}
                  onChange={e => setPrixSeuil(e.target.value)}
                  placeholder="Si vide : pas de seuil"
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: '#8A7A6A', margin: '4px 0 0' }}>
                  Si le prix l&apos;atteint sans preneur, l&apos;annonce devient un Don.
                </p>
              </Field>
            </>
          )}
        </Section>
      )}

      {/* ─────────── Conditions de remise ─────────── */}
      <Section title="Conditions">
        <label style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderRadius: 12,
          backgroundColor: remiseMP ? '#E8F2EB' : '#F8F4EE',
          border: remiseMP ? '1.5px solid #2D5A3D' : '1.5px solid #E5DDD2',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={remiseMP}
            onChange={e => setRemiseMP(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#2D5A3D' }}
          />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1C1917' }}>🤝 Remise en main propre</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8A7A6A' }}>Vous remettez l&apos;article directement à l&apos;acheteur.</p>
          </div>
        </label>
      </Section>

      {/* ─────────── LIEU DE RETRAIT V3 ─────────── */}
      <Section title="Lieu de retrait">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid #F0EAE0' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#7A6A5A', flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <input
            value={ville}
            onChange={e => setVille(e.target.value)}
            placeholder="Ganges, Saint-Bauzille…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1A1209', fontFamily: 'inherit' }}
          />
        </div>
      </Section>

      {/* ─────────── COORDONNÉES V3 ─────────── */}
      <Section title="Coordonnées" subtitle="Au moins l'un des deux, partageable dans la discussion">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid #F0EAE0' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#7A6A5A', flexShrink: 0 }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <input
            type="tel"
            value={contactTel}
            onChange={e => setContactTel(e.target.value)}
            placeholder="06 12 34 56 78"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1A1209', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid #F0EAE0' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#7A6A5A', flexShrink: 0 }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder="Email (optionnel)"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1A1209', fontFamily: 'inherit' }}
          />
        </div>
      </Section>

      {!initial && (
        <p style={{ fontSize: 11, color: '#7A6A5A', margin: 0, textAlign: 'center' }}>
          Ton annonce restera en ligne pendant <b>{dureeJours} jours</b> (plan {plan}).
        </p>
      )}


      {error && (
        <p style={{ fontSize: 13, color: '#C0392B', margin: 0, fontWeight: 600, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 10, textAlign: 'center' }}>{error}</p>
      )}

      {/* Sticky CTA bottom V3 */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: '#FFFFFF', borderTop: '1px solid #EDE8E0',
          padding: '12px 16px 16px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        }}
      >
        <button
          type="submit"
          disabled={submitting || uploading}
          style={{
            width: '100%', height: 48, borderRadius: 14, border: 'none',
            backgroundColor: '#2D5A3D', color: '#fff',
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {submitting ? (
            <>
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              Publication…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {initial ? 'Mettre à jour' : 'Publier l\'annonce'}
            </>
          )}
        </button>
      </div>

      {showUpgrade && (
        <SubscriptionModal
          context={{ kind: 'feature', featureLabel: 'Annonces illimitées', minPlan: 'habitants' }}
          onClose={() => setShowUpgrade(false)}
          currentPlan={plan}
        />
      )}
    </form>
  )
}

// ─────────── Helpers visuels ───────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
        {subtitle && <p style={{ fontSize: 11, color: '#A89B8C', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#3C2C20' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 10,
  border: '1.5px solid #E5DDD2',
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#1C1917',
  backgroundColor: '#fff',
}

