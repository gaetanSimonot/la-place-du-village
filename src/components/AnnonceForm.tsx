'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
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

interface Props {
  initial?: Annonce | null
  onSuccess?: (annonceId: string) => void
}

const TYPE_INFO: Record<AnnonceType, { label: string; emoji: string; color: string; bg: string; help: string }> = {
  vente:            { label: 'Vente',   emoji: '🏷️', color: '#3A5BC7', bg: '#EEF3FF', help: 'Prix fixe, contact direct.' },
  troc:             { label: 'Troc',    emoji: '🔄', color: '#E8622A', bg: '#FFF0EB', help: 'Échange contre autre chose.' },
  don:              { label: 'Don',     emoji: '🎁', color: '#2D5A3D', bg: '#E8F2EB', help: 'Gratuit, visible par tous.' },
  enchere_inversee: { label: 'Enchère', emoji: '📉', color: '#C0392B', bg: '#FBE9E7', help: 'Le prix baisse chaque jour. Si personne ne prend avant le seuil, l\'annonce devient un don.' },
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
  const [remiseMP, setRemiseMP]           = useState<boolean>(initial?.remise_main_propre ?? true)
  const [uploading, setUploading]         = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const cameraInputRef  = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

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

    if (!res.ok) { setError(data.error ?? 'Erreur'); return }

    const id = data.annonce?.id ?? initial?.id
    if (onSuccess && id) onSuccess(id)
    else if (id) router.push(`/annonces/${id}`)
  }

  const showPrix    = type === 'vente' || type === 'enchere_inversee'
  const showEnchere = type === 'enchere_inversee'
  const dureeJours  = getDureeAnnonceJours(plan)
  const info = TYPE_INFO[type]

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ─────────── Type ─────────── */}
      <Section title="Type d'annonce">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(['vente', 'troc', 'don', 'enchere_inversee'] as AnnonceType[]).map(t => {
            const allowed = typesAutorises.includes(t)
            const ti = TYPE_INFO[t]
            return (
              <button
                key={t}
                type="button"
                disabled={!allowed}
                onClick={() => setType(t)}
                title={!allowed ? `Plan ${plan} → upgrade requis` : ''}
                style={{
                  padding: '14px 12px', borderRadius: 14,
                  border: type === t ? `2px solid ${ti.color}` : '1.5px solid #E5DDD2',
                  backgroundColor: type === t ? ti.bg : '#fff',
                  fontFamily: 'inherit',
                  cursor: allowed ? 'pointer' : 'not-allowed',
                  opacity: allowed ? 1 : 0.45,
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                }}
              >
                <span style={{ fontSize: 22 }}>{ti.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: type === t ? ti.color : '#1C1917' }}>
                  {ti.label}
                </span>
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: '#8A7A6A', margin: '8px 0 0' }}>{info.help}</p>
        {plan === 'basic' && (
          <p style={{ fontSize: 12, color: '#C0392B', margin: '6px 0 0' }}>
            Plan Basic : seul le don est autorisé. <a href="/profil" style={{ color: '#2D5A3D', textDecoration: 'underline' }}>Passer Pro</a> pour le reste.
          </p>
        )}
      </Section>

      {/* ─────────── Photos ─────────── */}
      <Section title="Photos">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {photos.map(url => (
            <div key={url} style={{ position: 'relative', width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F0EBE3' }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 22, height: 22, borderRadius: '50%',
                  backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff',
                  border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1,
                }}
              >×</button>
            </div>
          ))}
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
          onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            style={uploadBtnStyle('#2D5A3D')}
          >📷 Prendre une photo</button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
            style={uploadBtnStyle('#fff', '#2D5A3D')}
          >🖼 Galerie</button>
        </div>
        {uploading && <p style={{ fontSize: 12, color: '#8A7A6A', margin: '6px 0 0' }}>Envoi en cours…</p>}
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
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="État, usage, détails…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
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

      {/* ─────────── Localisation ─────────── */}
      <Section title="Localisation (optionnel)">
        <input
          value={ville}
          onChange={e => setVille(e.target.value)}
          placeholder="Ganges, Saint-Bauzille, etc."
          style={inputStyle}
        />
      </Section>

      {/* ─────────── Coordonnées (requises) ─────────── */}
      <Section title="📞 Coordonnées" subtitle="Au moins l'une des deux. Partageables dans la discussion avec l'acheteur.">
        <Field label="Téléphone">
          <input
            type="tel"
            value={contactTel}
            onChange={e => setContactTel(e.target.value)}
            placeholder="06 12 34 56 78"
            style={inputStyle}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder="moi@exemple.fr"
            style={inputStyle}
          />
        </Field>
      </Section>

      {!initial && (
        <p style={{ fontSize: 12, color: '#8A7A6A', margin: 0, textAlign: 'center' }}>
          Ton annonce restera en ligne pendant <b>{dureeJours} jours</b> (plan {plan}).
        </p>
      )}

      {error && (
        <p style={{ fontSize: 13, color: '#C0392B', margin: 0, fontWeight: 600, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 10, textAlign: 'center' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || uploading}
        style={{
          padding: '15px 20px', borderRadius: 14, border: 'none',
          backgroundColor: '#2D5A3D', color: '#fff',
          fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
          cursor: submitting ? 'wait' : 'pointer',
          opacity: submitting ? 0.6 : 1,
          boxShadow: '0 4px 14px rgba(45,90,61,0.25)',
        }}
      >
        {submitting ? '…' : initial ? 'Mettre à jour' : 'Publier l\'annonce'}
      </button>
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

function uploadBtnStyle(bg: string, fg = '#fff'): React.CSSProperties {
  return {
    flex: 1, padding: '11px 14px', borderRadius: 12,
    border: bg === '#fff' ? `1.5px solid ${fg}` : 'none',
    backgroundColor: bg, color: bg === '#fff' ? fg : fg,
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer',
  }
}
