'use client'
import { useState, useEffect, useCallback } from 'react'

interface Centre {
  id: string
  nom: string
  lat: number
  lng: number
}

export default function ZoneAdmin() {
  const [centres, setCentres]         = useState<Centre[]>([])
  const [rayonInsertion, setRayonInsertion] = useState(100)
  const [rayonAffichage, setRayonAffichage] = useState(50)
  const [newNom, setNewNom]           = useState('')
  const [adding, setAdding]           = useState(false)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  const fetchZone = useCallback(async () => {
    const res  = await fetch('/api/admin/zone')
    const data = await res.json()
    setCentres(data.centres ?? [])
    setRayonInsertion(data.rayon_insertion ?? 100)
    setRayonAffichage(data.rayon_affichage ?? 50)
  }, [])

  useEffect(() => { fetchZone() }, [fetchZone])

  const validerZone = async () => {
    setSaving(true)
    setSaved(false)
    await fetch('/api/admin/zone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rayon_insertion: rayonInsertion, rayon_affichage: rayonAffichage }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addCentre = async () => {
    if (!newNom.trim()) return
    setAdding(true)
    setError(null)
    const res  = await fetch('/api/admin/zone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: newNom.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Erreur')
    } else {
      setNewNom('')
      await fetchZone()
    }
    setAdding(false)
  }

  const deleteCentre = async (id: string) => {
    setDeletingId(id)
    await fetch(`/api/admin/zone/${id}`, { method: 'DELETE' })
    await fetchZone()
    setDeletingId(null)
  }

  return (
    <div className="p-4 space-y-5">

      {/* Centres */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <p className="font-bold text-[#2C1810] text-sm">Centres de la zone</p>
        <p className="text-xs text-gray-400">Un événement est dans la zone s&apos;il est à portée d&apos;au moins un centre.</p>

        <div className="flex gap-2">
          <input
            value={newNom}
            onChange={e => { setNewNom(e.target.value); setError(null) }}
            onKeyDown={e => e.key === 'Enter' && addCentre()}
            placeholder="Nom du village (ex: Le Vigan)"
            className="flex-1 bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C4622D]"
          />
          <button
            onClick={addCentre}
            disabled={adding || !newNom.trim()}
            className="bg-[#C4622D] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {adding ? '…' : '+ Ajouter'}
          </button>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-2">
          {centres.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-[#FBF7F0] rounded-xl px-3 py-2.5">
              <span className="text-base">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#2C1810]">{c.nom}</p>
                <p className="text-xs text-gray-400">{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</p>
              </div>
              <button
                onClick={() => deleteCentre(c.id)}
                disabled={deletingId === c.id}
                className="text-red-300 hover:text-red-500 text-lg transition-colors disabled:opacity-40"
              >
                🗑️
              </button>
            </div>
          ))}
          {centres.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">Aucun centre — Ganges utilisé par défaut</p>
          )}
        </div>
      </div>

      {/* Rayon affichage */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-[#2C1810] text-sm">Rayon d&apos;affichage</p>
            <p className="text-xs text-gray-400 mt-0.5">Masque les events trop loin sur la carte et la liste</p>
          </div>
          <span className="text-[#C4622D] font-bold text-lg">{rayonAffichage} km</span>
        </div>
        <input
          type="range" min={5} max={200} step={5}
          value={rayonAffichage}
          onChange={e => setRayonAffichage(Number(e.target.value))}
          className="w-full accent-[#C4622D]"
        />
        <div className="flex justify-between text-xs text-gray-400"><span>5 km</span><span>200 km</span></div>
      </div>

      {/* Rayon insertion */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-[#2C1810] text-sm">Rayon d&apos;insertion</p>
            <p className="text-xs text-gray-400 mt-0.5">Rejette les events trop loin lors de la soumission</p>
          </div>
          <span className="text-[#C4622D] font-bold text-lg">{rayonInsertion} km</span>
        </div>
        <input
          type="range" min={5} max={200} step={5}
          value={rayonInsertion}
          onChange={e => setRayonInsertion(Number(e.target.value))}
          className="w-full accent-[#C4622D]"
        />
        <div className="flex justify-between text-xs text-gray-400"><span>5 km</span><span>200 km</span></div>
      </div>

      {/* Bouton valider */}
      <button
        onClick={validerZone}
        disabled={saving}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-colors ${
          saved ? 'bg-green-500 text-white' : 'bg-[#C4622D] text-white disabled:opacity-50'
        }`}
      >
        {saving ? 'Sauvegarde…' : saved ? '✓ Zone validée — carte et liste mises à jour' : 'Valider la zone'}
      </button>
    </div>
  )
}
