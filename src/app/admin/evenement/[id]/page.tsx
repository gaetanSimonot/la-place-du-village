'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation, Categorie } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'

interface Prediction { place_id: string; description: string; main: string; secondary: string }

function LieuAutocomplete({
  value, onChange, onSelect,
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (p: Prediction) => void
}) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setPredictions([]); return }
    const res = await fetch(`/api/admin/autocomplete?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setPredictions(data.predictions ?? [])
    setOpen(true)
  }, [])

  const handleChange = (v: string) => {
    onChange(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 300)
  }

  const handleSelect = (p: Prediction) => {
    onChange(p.main)
    setPredictions([])
    setOpen(false)
    onSelect(p)
  }

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom du lieu</label>
      <input
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Salle des fêtes, Halles de Ganges..."
        className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]"
      />
      {open && predictions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 bg-white border border-[#E8E0D5] rounded-xl shadow-lg mt-1 overflow-hidden">
          {predictions.map(p => (
            <button
              key={p.place_id}
              onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-2.5 hover:bg-[#FBF7F0] transition-colors border-b border-[#F0EAE0] last:border-0"
            >
              <p className="text-sm font-medium text-[#2C1810]">{p.main}</p>
              <p className="text-xs text-gray-400">{p.secondary}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminEditPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [evt, setEvt] = useState<Evenement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apercu, setApercu] = useState(false)
  const [texteIA, setTexteIA] = useState('')
  const [analyseLoading, setAnalyseLoading] = useState(false)
  const [analyseMsg, setAnalyseMsg] = useState<string | null>(null)

  // Champs événement
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [heure, setHeure] = useState('')
  const [categorie, setCategorie] = useState<Categorie>('autre')
  const [statut, setStatut] = useState('en_attente')
  const [prix, setPrix] = useState('')
  const [contact, setContact] = useState('')
  const [organisateurs, setOrganisateurs] = useState('')

  // Champs lieu
  const [lieuNom, setLieuNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [commune, setCommune] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('evenements')
        .select('*, lieux(*)')
        .eq('id', params.id)
        .single()
      if (!data) { setLoading(false); return }
      const e = data as Evenement
      setEvt(e)
      setTitre(e.titre ?? '')
      setDescription(e.description ?? '')
      setDateDebut(e.date_debut ?? '')
      setDateFin(e.date_fin ?? '')
      setHeure(e.heure?.slice(0, 5) ?? '')
      setCategorie(e.categorie)
      setStatut(e.statut)
      setPrix(e.prix ?? '')
      setContact(e.contact ?? '')
      setOrganisateurs(e.organisateurs ?? '')
      if (e.lieux) {
        setLieuNom(e.lieux.nom ?? '')
        setAdresse(e.lieux.adresse ?? '')
        setCommune(e.lieux.commune ?? '')
        setLat(e.lieux.lat?.toString() ?? '')
        setLng(e.lieux.lng?.toString() ?? '')
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  const rechercherLieu = async () => {
    if (!lieuNom.trim() && !commune.trim()) return
    setSaving(true)
    try {
      const query = [lieuNom, commune, 'France'].filter(Boolean).join(', ')
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.lat) {
        setLat(data.lat.toString())
        setLng(data.lng.toString())
        if (data.adresse) setAdresse(data.adresse)
        if (data.nom && !lieuNom.trim()) setLieuNom(data.nom)
      } else {
        setError('Lieu non trouvé par Google Places')
      }
    } finally {
      setSaving(false)
    }
  }

  const analyserAvecIA = async () => {
    if (!texteIA.trim()) return
    setAnalyseLoading(true)
    setAnalyseMsg(null)
    setError(null)
    try {
      // Combine le texte existant avec le nouveau pour que Claude ait tout le contexte
      const contexte = [
        titre && `Titre actuel : ${titre}`,
        description && `Description actuelle : ${description}`,
        texteIA,
      ].filter(Boolean).join('\n')

      const res = await fetch('/api/extract/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: contexte }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const e = data.extracted
      const geo = data.geo
      const updates: string[] = []

      // Met à jour uniquement les champs que Claude a trouvés
      if (e.titre && e.titre !== titre) { setTitre(e.titre); updates.push('titre') }
      if (e.description && e.description !== description) { setDescription(e.description); updates.push('description') }
      if (e.date_debut && e.date_debut !== dateDebut) { setDateDebut(e.date_debut); updates.push('date') }
      if (e.date_fin && e.date_fin !== dateFin) { setDateFin(e.date_fin) }
      if (e.heure && e.heure !== heure) { setHeure(e.heure); updates.push('heure') }
      if (e.categorie && e.categorie !== 'autre') { setCategorie(e.categorie); updates.push('catégorie') }
      if (e.prix && e.prix !== prix) { setPrix(e.prix); updates.push('prix') }
      if (e.contact && e.contact !== contact) { setContact(e.contact); updates.push('contact') }
      if (e.organisateurs && e.organisateurs !== organisateurs) { setOrganisateurs(e.organisateurs); updates.push('organisateurs') }
      if (e.lieu_nom && e.lieu_nom !== lieuNom) { setLieuNom(e.lieu_nom); updates.push('lieu') }
      if (e.commune && e.commune !== commune) { setCommune(e.commune) }
      if (geo.lat && (!lat || lat === '43.9333')) { setLat(geo.lat.toString()); setLng(geo.lng.toString()); updates.push('coordonnées') }
      if (geo.adresse && !adresse) { setAdresse(geo.adresse) }

      setAnalyseMsg(
        updates.length > 0
          ? `✓ Mis à jour : ${updates.join(', ')}`
          : 'Aucun nouveau champ trouvé'
      )
      setTexteIA('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur IA')
    } finally {
      setAnalyseLoading(false)
    }
  }

  const sauvegarder = async (statutOverride?: string) => {
    setSaving(true)
    setError(null)
    try {
      const statutFinal = statutOverride ?? statut
      const body: Record<string, unknown> = {
        titre, description, date_debut: dateDebut || null,
        date_fin: dateFin || null, heure: heure || null,
        categorie, statut: statutFinal, prix: prix || null,
        contact: contact || null, organisateurs: organisateurs || null,
      }
      if (evt?.lieu_id) {
        body.lieu_id = evt.lieu_id
        body.lieu_nom = lieuNom
        body.adresse = adresse || null
        body.commune = commune || null
        body.lat = lat ? parseFloat(lat) : null
        body.lng = lng ? parseFloat(lng) : null
        // Si lat/lng manuels fournis → marquer comme précis (place_id_google reste inchangé)
        if (lat && lng) body.place_id_google = evt.lieux?.place_id_google ?? 'manual'
      }

      const res = await fetch(`/api/admin/evenements/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/admin')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!evt) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">Événement introuvable</p>
    </div>
  )

  const approx = isApproxLocation(evt.lieux)

  const inp = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]"
      />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <div className="sticky top-0 z-10 bg-[#2C1810] text-white px-4 py-3 flex items-center gap-3">
        <Link href="/admin" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold flex-1 truncate">Éditer l&apos;événement</h1>
      </div>

      <div className="p-4 space-y-3 pb-32">

        {/* Compléter avec l'IA */}
        <div className="bg-[#2C1810] rounded-2xl p-4 space-y-2">
          <p className="text-white text-sm font-bold">🤖 Compléter avec l&apos;IA</p>
          <p className="text-gray-400 text-xs">Colle du texte supplémentaire — Claude complète les champs manquants sans écraser tes corrections.</p>
          <textarea
            value={texteIA}
            onChange={e => setTexteIA(e.target.value)}
            rows={3}
            placeholder="Ex : contact 06 12 34 56 78, entrée 5€, organisé par l'asso Fête du Village..."
            className="w-full bg-[#3D2A20] border border-[#5C3A25] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-[#C4622D]"
          />
          {analyseMsg && (
            <p className={`text-xs font-medium ${analyseMsg.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}>
              {analyseMsg}
            </p>
          )}
          <button
            onClick={analyserAvecIA}
            disabled={analyseLoading || !texteIA.trim()}
            className="w-full py-2.5 bg-[#C4622D] text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-opacity"
          >
            {analyseLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyse...
              </span>
            ) : 'Analyser et compléter →'}
          </button>
        </div>

        {/* Statut */}
        <div className="bg-white rounded-2xl p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Statut</label>
          <div className="flex gap-2">
            {['publie', 'en_attente', 'rejete'].map(s => (
              <button
                key={s}
                onClick={() => setStatut(s)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  statut === s
                    ? s === 'publie' ? 'bg-green-500 text-white'
                    : s === 'en_attente' ? 'bg-orange-400 text-white'
                    : 'bg-gray-400 text-white'
                    : 'bg-[#FBF7F0] text-gray-400'
                }`}
              >
                {s === 'publie' ? 'Publié' : s === 'en_attente' ? 'En attente' : 'Rejeté'}
              </button>
            ))}
          </div>
        </div>

        {/* Infos principales */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          {inp('Titre', titre, setTitre)}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Catégorie</label>
            <select
              value={categorie}
              onChange={e => setCategorie(e.target.value as Categorie)}
              className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C4622D]"
            >
              {(Object.entries(CATEGORIES) as [Categorie, { label: string; emoji: string }][]).map(([k, c]) => (
                <option key={k} value={k}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] resize-none focus:outline-none focus:border-[#C4622D]"
            />
          </div>
        </div>

        {/* Date & heure */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date & Heure</p>
          {inp('Date de début', dateDebut, setDateDebut, 'date')}
          {inp('Date de fin', dateFin, setDateFin, 'date')}
          {inp('Heure', heure, setHeure, 'time')}
        </div>

        {/* Lieu */}
        <div className={`bg-white rounded-2xl p-4 space-y-3 ${approx ? 'border-2 border-orange-300' : ''}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lieu</p>
            {approx && <span className="text-xs text-orange-500 font-semibold">⚠️ Coords à corriger</span>}
          </div>
          <LieuAutocomplete
            value={lieuNom}
            onChange={setLieuNom}
            onSelect={async (p) => {
              // Géocode la sélection immédiatement
              const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(p.description)}`)
              const data = await res.json()
              if (data.lat) {
                setLat(data.lat.toString())
                setLng(data.lng.toString())
                if (data.adresse) setAdresse(data.adresse)
                // Extrait la commune depuis secondary_text si dispo
                if (p.secondary && !commune) {
                  const parts = p.secondary.split(',')
                  if (parts[0]) setCommune(parts[0].trim())
                }
              }
            }}
          />
          {inp('Adresse', adresse, setAdresse)}
          {inp('Commune', commune, setCommune)}

          <button
            onClick={rechercherLieu}
            disabled={saving}
            className="w-full py-2 bg-[#FBF7F0] border border-[#C4622D] text-[#C4622D] text-sm font-bold rounded-xl"
          >
            🔍 Rechercher sur Google Places
          </button>

          <div className="grid grid-cols-2 gap-2">
            {inp('Latitude', lat, setLat, 'number', '43.9333')}
            {inp('Longitude', lng, setLng, 'number', '3.7005')}
          </div>
          {lat && lng && (
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-[#C4622D] underline"
            >
              Vérifier sur Google Maps →
            </a>
          )}
        </div>

        {/* Infos pratiques */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Infos pratiques</p>
          {inp('Prix', prix, setPrix)}
          {inp('Contact', contact, setContact)}
          {inp('Organisateurs', organisateurs, setOrganisateurs)}
        </div>

        {error && <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{error}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#E8E0D5] flex gap-3">
        <Link href="/admin" className="flex-1 py-3 rounded-2xl border-2 border-[#E8E0D5] text-gray-400 font-bold text-sm text-center">
          Annuler
        </Link>
        <button
          onClick={() => { setError(null); setApercu(true) }}
          className="flex-grow-[2] py-3 bg-[#C4622D] text-white rounded-2xl font-bold text-sm"
        >
          Aperçu →
        </button>
      </div>

      {/* Overlay aperçu */}
      {apercu && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          <div className="bg-[#2C1810] text-white px-4 py-3 flex items-center gap-3 shrink-0">
            <button onClick={() => setApercu(false)} className="text-[#C4622D] font-bold text-2xl leading-none">←</button>
            <p className="font-bold flex-1">Aperçu de la fiche</p>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#FBF7F0]">
            <ApercuFiche
              titre={titre}
              description={description}
              dateDebut={dateDebut}
              dateFin={dateFin}
              heure={heure}
              categorie={categorie}
              statut={statut}
              prix={prix}
              contact={contact}
              organisateurs={organisateurs}
              lieuNom={lieuNom}
              adresse={adresse}
              commune={commune}
              lat={lat}
              lng={lng}
              imageUrl={evt!.image_url}
              placeIdGoogle={evt!.lieux?.place_id_google ?? null}
            />
            {error && <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3 mx-4 mb-4">{error}</p>}
          </div>

          <div className="p-4 bg-white border-t border-[#E8E0D5] flex gap-3 shrink-0">
            <button
              onClick={() => setApercu(false)}
              className="flex-1 py-3 rounded-2xl border-2 border-[#E8E0D5] text-gray-500 font-bold text-sm"
            >
              ← Éditer encore
            </button>
            <button
              onClick={() => sauvegarder('publie')}
              disabled={saving}
              className="flex-grow-[2] py-3 bg-green-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50"
            >
              {saving ? 'Publication...' : '✓ Confirmer et publier'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ApercuFiche(p: {
  titre: string; description: string; dateDebut: string; dateFin: string
  heure: string; categorie: Categorie; statut: string; prix: string
  contact: string; organisateurs: string; lieuNom: string; adresse: string
  commune: string; lat: string; lng: string; imageUrl: string | null; placeIdGoogle: string | null
}) {
  const cat = CATEGORIES[p.categorie] ?? CATEGORIES.autre
  const approx = !!p.lat && !p.placeIdGoogle
  const mapsUrl = p.lat && p.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
    : p.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.adresse)}` : null

  return (
    <div className="pb-8">
      {p.imageUrl && <img src={p.imageUrl} alt={p.titre} className="w-full h-52 object-cover" />}
      <div className="p-4 space-y-3">
        {/* Statut */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            p.statut === 'publie' ? 'bg-green-100 text-green-700'
            : p.statut === 'en_attente' ? 'bg-orange-100 text-orange-600'
            : 'bg-gray-100 text-gray-500'
          }`}>
            {p.statut === 'publie' ? '● Publié' : p.statut === 'en_attente' ? '● En attente' : '● Rejeté'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full text-white" style={{ backgroundColor: cat.color }}>
            {cat.emoji} {cat.label}
          </span>
        </div>

        <h2 className="text-2xl font-bold text-[#2C1810] leading-tight">{p.titre || '—'}</h2>

        {/* Infos pratiques */}
        <div className="bg-white rounded-2xl p-4 space-y-2.5">
          {p.dateDebut && (
            <div className="flex items-center gap-2 text-sm">
              <span>📅</span>
              <span className="font-medium">{formatDate(p.dateDebut, 'long')}</span>
              {p.dateFin && p.dateFin !== p.dateDebut && (
                <span className="text-gray-400 text-xs">→ {formatDate(p.dateFin, 'long')}</span>
              )}
            </div>
          )}
          {p.heure && (
            <div className="flex items-center gap-2 text-sm">
              <span>🕐</span><span className="font-medium">{p.heure}</span>
            </div>
          )}
          {(p.lieuNom || p.commune) && (
            <div className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">📍</span>
              <div>
                <span className="font-medium">{p.lieuNom || p.commune}</span>
                {approx && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-500 font-semibold px-1.5 py-0.5 rounded-full">
                    localisation approximative
                  </span>
                )}
                {p.adresse && <p className="text-gray-500 text-xs">{p.adresse}</p>}
                {p.commune && p.commune !== p.lieuNom && (
                  <p className="text-gray-500 text-xs">{p.commune}</p>
                )}
                {p.lat && p.lng && (
                  <p className="text-gray-400 text-xs">{parseFloat(p.lat).toFixed(5)}, {parseFloat(p.lng).toFixed(5)}</p>
                )}
              </div>
            </div>
          )}
          {p.prix && (
            <div className="flex items-center gap-2 text-sm">
              <span>💶</span><span className="font-medium">{p.prix}</span>
            </div>
          )}
        </div>

        {p.description && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-[#2C1810] mb-2">À propos</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{p.description}</p>
          </div>
        )}

        {(p.contact || p.organisateurs) && (
          <div className="bg-white rounded-2xl p-4 space-y-1.5">
            <h3 className="font-bold text-[#2C1810] mb-1">Contact</h3>
            {p.organisateurs && <p className="text-sm text-gray-600">🏛️ {p.organisateurs}</p>}
            {p.contact && <p className="text-sm text-gray-600">📞 {p.contact}</p>}
          </div>
        )}

        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="block w-full bg-[#C4622D] text-white text-center py-4 rounded-2xl font-bold">
            🗺️ Y aller
          </a>
        )}
      </div>
    </div>
  )
}
