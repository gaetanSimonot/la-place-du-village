'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { Categorie } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import ImageLightbox from '@/components/ImageLightbox'
import FeedbackButton from '@/components/FeedbackButton'

const SESSION_KEY      = 'pdv-admin-session'
const SESSION_DURATION = 30 * 60 * 1000

function isAdminSession(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const { ts } = JSON.parse(raw)
    return Date.now() - ts < SESSION_DURATION
  } catch { return false }
}

interface EditForm {
  titre: string
  description: string
  date_debut: string
  date_fin: string
  heure: string
  categorie: Categorie
  prix: string
  contact: string
  organisateurs: string
  statut: string
}

export default function EvenementPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [evt, setEvt]       = useState<Evenement | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState<EditForm | null>(null)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setIsAdmin(isAdminSession())
    supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
      .then(({ data }) => {
        if (data) setEvt(data as Evenement)
        setLoading(false)
      })
  }, [id])

  const startEdit = () => {
    if (!evt) return
    setForm({
      titre:         evt.titre         ?? '',
      description:   evt.description   ?? '',
      date_debut:    evt.date_debut     ?? '',
      date_fin:      evt.date_fin       ?? '',
      heure:         evt.heure          ? evt.heure.slice(0, 5) : '',
      categorie:     (evt.categorie     ?? 'autre') as Categorie,
      prix:          evt.prix           ?? '',
      contact:       evt.contact        ?? '',
      organisateurs: evt.organisateurs  ?? '',
      statut:        evt.statut         ?? 'en_attente',
    })
    setEditing(true)
    setError(null)
  }

  const cancelEdit = () => {
    setEditing(false)
    setForm(null)
    router.back()
  }

  const saveEdit = async () => {
    if (!form || !evt) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/evenements/${evt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      // Mettre à jour l'état local
      const updated = { ...evt, ...form }
      setEvt(updated as Evenement)
      setEditing(false)
      setForm(null)
      router.back()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Erreur sauvegarde')
    }
    setSaving(false)
  }

  const f = (label: string, key: keyof EditForm, type = 'text', placeholder = '') => (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={form![key]}
        onChange={e => setForm(p => ({ ...p!, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E0D8CE', borderRadius: 12, padding: '10px 14px', fontSize: 14, backgroundColor: '#FBF7F0', outline: 'none', fontFamily: 'Inter, sans-serif' }}
      />
    </div>
  )

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#C4622D', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  if (!evt) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <p style={{ color: '#8A8A8A' }}>Événement introuvable</p>
    </div>
  )

  const cat   = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu  = evt.lieux
  const mapsUrl = lieu?.lat && lieu?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lieu.lat},${lieu.lng}`
    : lieu?.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lieu.adresse)}`
    : null

  // ── Mode édition ─────────────────────────────────────────────────────────────
  if (editing && form) {
    return (
      <div className="min-h-screen bg-[#FBF7F0]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
          <button onClick={cancelEdit} className="text-[#C4622D] font-bold text-2xl leading-none">←</button>
          <h1 className="font-bold text-[#2C1810] flex-1 text-base">Modifier l&apos;événement</h1>
          <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-1 rounded-full">Admin</span>
        </div>

        <div className="p-4 space-y-3 pb-32" style={{ fontFamily: 'Inter, sans-serif' }}>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            {f('Titre', 'titre')}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Catégorie</label>
              <select
                value={form.categorie}
                onChange={e => setForm(p => ({ ...p!, categorie: e.target.value as Categorie }))}
                style={{ width: '100%', border: '1px solid #E0D8CE', borderRadius: 12, padding: '10px 14px', fontSize: 14, backgroundColor: '#FBF7F0', outline: 'none' }}
              >
                {(Object.entries(CATEGORIES) as [Categorie, { label: string; emoji: string }][]).map(([k, c]) => (
                  <option key={k} value={k}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Statut</label>
              <select
                value={form.statut}
                onChange={e => setForm(p => ({ ...p!, statut: e.target.value }))}
                style={{ width: '100%', border: '1px solid #E0D8CE', borderRadius: 12, padding: '10px 14px', fontSize: 14, backgroundColor: '#FBF7F0', outline: 'none' }}
              >
                <option value="publie">Publié</option>
                <option value="en_attente">En attente</option>
                <option value="a_verifier">À vérifier</option>
                <option value="rejete">Rejeté</option>
                <option value="archive">Archivé</option>
              </select>
            </div>
            {f('Description', 'description')}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1 }}>Date & Heure</p>
            {f('Date de début', 'date_debut', 'date')}
            {f('Date de fin', 'date_fin', 'date')}
            {f('Heure', 'heure', 'time')}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1 }}>Infos pratiques</p>
            {f('Prix', 'prix', 'text', 'Gratuit, 5€...')}
            {f('Contact', 'contact')}
            {f('Organisateurs', 'organisateurs')}
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 13, backgroundColor: '#fef2f2', borderRadius: 12, padding: '10px 14px' }}>{error}</p>}
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTop: '1px solid #E8E0D5', display: 'flex', gap: 10 }}>
          <button
            onClick={cancelEdit}
            style={{ flex: 1, padding: 14, borderRadius: 16, border: '1px solid #E0D8CE', backgroundColor: 'transparent', color: '#8A8A8A', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            Annuler
          </button>
          <button
            onClick={saveEdit}
            disabled={saving}
            style={{ flex: 2, padding: 14, borderRadius: 16, border: 'none', backgroundColor: '#C4622D', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    )
  }

  // ── Vue normale ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold text-[#2C1810] flex-1 truncate text-base">{evt.titre}</h1>
        {isAdmin && (
          <button
            onClick={startEdit}
            style={{ fontSize: 11, fontWeight: 700, color: '#C4622D', border: '1px solid #C4622D', borderRadius: 999, padding: '4px 12px', backgroundColor: 'transparent', cursor: 'pointer' }}
          >
            ✏️ Éditer
          </button>
        )}
      </div>

      {evt.image_url && <ImageLightbox src={evt.image_url} alt={evt.titre} />}

      <div className="p-4 space-y-3 pb-8">
        <div>
          <span
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full text-white mb-2"
            style={{ backgroundColor: cat.color }}
          >
            {cat.emoji} {cat.label}
          </span>
          <h2 className="text-2xl font-bold text-[#2C1810] leading-tight">{evt.titre}</h2>
        </div>

        <div className="bg-white rounded-2xl p-4 space-y-2.5">
          {evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="font-medium">{formatDate(evt.date_debut, 'long')}</span>
            </div>
          )}
          {evt.date_fin && evt.date_fin !== evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="text-gray-500">jusqu&apos;au {formatDate(evt.date_fin, 'long')}</span>
            </div>
          )}
          {evt.heure && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">🕐</span>
              <span className="font-medium">{evt.heure.slice(0, 5)}</span>
            </div>
          )}
          {lieu && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-base mt-0.5">📍</span>
              <div>
                <span className="font-medium">{lieu.nom}</span>
                {isApproxLocation(lieu) && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-500 font-semibold px-1.5 py-0.5 rounded-full">
                    localisation approximative
                  </span>
                )}
                {lieu.adresse && <p className="text-gray-500 text-xs">{lieu.adresse}</p>}
                {lieu.commune && !lieu.adresse && <p className="text-gray-500 text-xs">{lieu.commune}</p>}
              </div>
            </div>
          )}
          {evt.prix && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">💶</span>
              <span className="font-medium">{evt.prix}</span>
            </div>
          )}
        </div>

        {evt.description && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-[#2C1810] mb-2">À propos</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{evt.description}</p>
          </div>
        )}

        {(evt.contact || evt.organisateurs) && (
          <div className="bg-white rounded-2xl p-4 space-y-1.5">
            <h3 className="font-bold text-[#2C1810] mb-1">Contact</h3>
            {evt.organisateurs && <p className="text-sm text-gray-600">🏛️ {evt.organisateurs}</p>}
            {evt.contact && <p className="text-sm text-gray-600">📞 {evt.contact}</p>}
          </div>
        )}

        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-[#C4622D] text-white text-center py-4 rounded-2xl font-bold text-base shadow-md active:bg-[#A8521E] transition-colors"
          >
            🗺️ Y aller
          </a>
        )}

        <FeedbackButton evenementId={evt.id} evenementTitre={evt.titre} />
      </div>
    </div>
  )
}
