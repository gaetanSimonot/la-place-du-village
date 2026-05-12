'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  CATEGORIES_ANNONCES,
  CATEGORIES_LABELS,
  getTypesAutorises,
  getDureeAnnonceJours,
  validateAnnonceInput,
  type Annonce,
  type AnnonceType,
  type AnnonceCategorie,
  type AnnonceCreateInput,
} from '@/lib/annonces'
import type { Plan } from '@/lib/capabilities'

interface Props {
  /** Si fourni, le formulaire est en mode édition. Sinon création. */
  initial?: Annonce | null
  onSuccess?: (annonceId: string) => void
}

const TYPE_LABELS: Record<AnnonceType, string> = {
  vente: '💰 Vente',
  troc: '🔄 Troc',
  don: '🎁 Don',
  enchere_inversee: '📉 Enchère inversée',
}

const TYPE_HELP: Record<AnnonceType, string> = {
  vente:            'Prix fixe, contact direct.',
  troc:             'Échange contre un autre objet, contact direct.',
  don:              'Gratuit, visible par tous.',
  enchere_inversee: 'Le prix baisse chaque jour. Si personne ne prend avant le seuil, l\'annonce devient un don.',
}

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
  const [uploading, setUploading]         = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

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
      if (upErr) { setError('Erreur upload — vérifie le bucket "annonces" dans Supabase Storage'); continue }
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

    if (!res.ok) { setError(data.error ?? 'Erreur'); return }

    const id = data.annonce?.id ?? initial?.id
    if (onSuccess && id) onSuccess(id)
    else if (id) router.push(`/annonces/${id}`)
  }

  const showPrix    = type === 'vente' || type === 'enchere_inversee'
  const showEnchere = type === 'enchere_inversee'
  const dureeJours  = getDureeAnnonceJours(plan)

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Type d'annonce */}
      <Field label="Type d'annonce">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['vente', 'troc', 'don', 'enchere_inversee'] as AnnonceType[]).map(t => {
            const allowed = typesAutorises.includes(t)
            return (
              <button
                key={t}
                type="button"
                disabled={!allowed}
                onClick={() => setType(t)}
                title={!allowed ? `Plan ${plan} → upgrade requis` : ''}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: type === t ? '2px solid #2D5A3D' : '1px solid #E5DDD2',
                  backgroundColor: type === t ? '#E8F2EB' : '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  color: !allowed ? '#C5B9A8' : '#1C1917',
                  cursor: allowed ? 'pointer' : 'not-allowed',
                  opacity: allowed ? 1 : 0.5,
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: '#8A7A6A', margin: '6px 0 0' }}>{TYPE_HELP[type]}</p>
        {plan === 'basic' && (
          <p style={{ fontSize: 12, color: '#C0392B', margin: '4px 0 0' }}>
            Plan Basic : seul le don est autorisé. <a href="/profil" style={{ color: '#2D5A3D', textDecoration: 'underline' }}>Passer Pro</a> pour débloquer les autres.
          </p>
        )}
      </Field>

      {/* Titre */}
      <Field label="Titre *">
        <input
          value={titre}
          onChange={e => setTitre(e.target.value)}
          maxLength={120}
          placeholder="Vélo électrique, état neuf"
          style={inputStyle}
          required
        />
      </Field>

      {/* Catégorie */}
      <Field label="Catégorie *">
        <select value={categorie} onChange={e => setCategorie(e.target.value as AnnonceCategorie)} style={inputStyle}>
          {CATEGORIES_ANNONCES.map(c => (
            <option key={c} value={c}>{CATEGORIES_LABELS[c]}</option>
          ))}
        </select>
      </Field>

      {/* Description */}
      <Field label="Description">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="Décris l'état, l'usage, les détails..."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Field>

      {/* Photos */}
      <Field label="Photos">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {photos.map(url => (
            <div key={url} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 22, height: 22, borderRadius: '50%',
                  backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
                  border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1,
                }}
              >×</button>
            </div>
          ))}
          <label style={{
            width: 80, height: 80, borderRadius: 8, border: '2px dashed #C5B9A8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: '#8A7A6A', cursor: 'pointer',
            backgroundColor: uploading ? '#F0EBE3' : 'transparent',
          }}>
            {uploading ? '…' : '+'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={e => handleUpload(e.target.files)}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </Field>

      {/* Prix (vente ou enchère) */}
      {showPrix && (
        <Field label={showEnchere ? 'Prix de départ * (€)' : 'Prix * (€)'}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={prixInitial}
            onChange={e => setPrixInitial(e.target.value)}
            placeholder="0.00"
            style={inputStyle}
          />
        </Field>
      )}

      {/* Champs spécifiques enchère */}
      {showEnchere && (
        <>
          <Field label="Taux de baisse quotidien * (%)">
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="99"
              value={tauxBaisse}
              onChange={e => setTauxBaisse(e.target.value)}
              placeholder="5"
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: '#8A7A6A', margin: '4px 0 0' }}>
              Chaque nuit, le prix actuel diminue de ce pourcentage.
            </p>
          </Field>
          <Field label="Seuil minimum (€) — optionnel">
            <input
              type="number"
              step="0.01"
              min="0"
              value={prixSeuil}
              onChange={e => setPrixSeuil(e.target.value)}
              placeholder="Laisser vide pour pas de seuil"
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: '#8A7A6A', margin: '4px 0 0' }}>
              Si le prix atteint ce seuil sans preneur, l&apos;annonce bascule automatiquement en Don.
            </p>
          </Field>
        </>
      )}

      {/* Contact */}
      <Field label="Téléphone (optionnel)">
        <input
          type="tel"
          value={contactTel}
          onChange={e => setContactTel(e.target.value)}
          placeholder="06 12 34 56 78"
          style={inputStyle}
        />
      </Field>
      <Field label="Email (optionnel)">
        <input
          type="email"
          value={contactEmail}
          onChange={e => setContactEmail(e.target.value)}
          placeholder="moi@exemple.fr"
          style={inputStyle}
        />
      </Field>

      {/* Ville */}
      <Field label="Ville (optionnel)">
        <input
          value={ville}
          onChange={e => setVille(e.target.value)}
          placeholder="Ganges, Saint-Bauzille, etc."
          style={inputStyle}
        />
      </Field>

      {!initial && (
        <p style={{ fontSize: 12, color: '#8A7A6A', margin: 0 }}>
          Ton annonce restera en ligne pendant <b>{dureeJours} jours</b> (plan {plan}).
        </p>
      )}

      {error && (
        <p style={{ fontSize: 13, color: '#C0392B', margin: 0, fontWeight: 600 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || uploading}
        style={{
          padding: '14px 20px',
          borderRadius: 12,
          border: 'none',
          backgroundColor: '#2D5A3D',
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          cursor: submitting ? 'wait' : 'pointer',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '...' : initial ? 'Mettre à jour' : 'Publier l\'annonce'}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#3C2C20' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #E5DDD2',
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#1C1917',
  backgroundColor: '#fff',
}
