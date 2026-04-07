'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Source {
  id: string
  nom: string
  url: string
  actif: boolean
  frequence: string
  dernier_scrape: string | null
  created_at: string
  scrape_logs: { id: string; created_at: string; trouves: number; doublons: number; inseres: number; erreur: string | null }[]
}

interface ScrapeResult {
  trouves: number
  doublons: number
  inseres: number
  erreur?: string
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState<string | null>(null)
  const [scrapeResult, setScrapeResult] = useState<Record<string, ScrapeResult>>({})
  const [form, setForm] = useState({ nom: '', url: '', frequence: '24h' })
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const fetchSources = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/sources')
    const data = await res.json()
    setSources(data.sources ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  const addSource = async () => {
    if (!form.nom.trim() || !form.url.trim()) return
    setAdding(true)
    await fetch('/api/admin/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ nom: '', url: '', frequence: '24h' })
    setShowForm(false)
    await fetchSources()
    setAdding(false)
  }

  const toggleActif = async (id: string, actif: boolean) => {
    await fetch(`/api/admin/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !actif }),
    })
    await fetchSources()
  }

  const deleteSource = async (id: string) => {
    if (!confirm('Supprimer cette source ?')) return
    await fetch(`/api/admin/sources/${id}`, { method: 'DELETE' })
    await fetchSources()
  }

  const scrapeNow = async (id: string) => {
    setScraping(id)
    setScrapeResult(r => ({ ...r, [id]: undefined as unknown as ScrapeResult }))
    const res = await fetch(`/api/scrape-source?id=${id}`)
    const data = await res.json()
    setScrapeResult(r => ({ ...r, [id]: data }))
    await fetchSources()
    setScraping(null)
  }

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* Header */}
      <div className="bg-[#2C1810] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/admin" className="text-[#C4622D] text-xl font-bold">←</Link>
        <h1 className="font-bold text-lg flex-1">Sources de scraping</h1>
        <button
          onClick={() => setShowForm(f => !f)}
          className="bg-[#C4622D] text-white text-sm font-bold px-3 py-1.5 rounded-lg"
        >
          + Ajouter
        </button>
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div className="bg-white border-b border-[#E8E0D5] p-4 space-y-3">
          <input
            value={form.nom}
            onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            placeholder="Nom (ex: Hérault Tourisme)"
            className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C4622D]"
          />
          <input
            value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder="URL (ex: https://www.herault-tourisme.com/agenda/)"
            className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C4622D]"
          />
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-500 font-semibold">Fréquence</label>
            <select
              value={form.frequence}
              onChange={e => setForm(f => ({ ...f, frequence: e.target.value }))}
              className="bg-[#FBF7F0] border border-[#E8E0D5] rounded-lg px-2 py-1.5 text-sm focus:outline-none"
            >
              <option value="12h">12h</option>
              <option value="24h">24h</option>
              <option value="48h">48h</option>
            </select>
            <button
              onClick={addSource}
              disabled={adding}
              className="ml-auto bg-[#C4622D] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {adding ? '...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sources.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Aucune source — ajoutez-en une</p>
        ) : sources.map(src => {
          const lastLog = src.scrape_logs?.[0]
          const result  = scrapeResult[src.id]
          const isScraping = scraping === src.id

          return (
            <div key={src.id} className="bg-white rounded-2xl p-4 shadow-sm border border-transparent">
              {/* Nom + toggle actif */}
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2C1810] leading-tight">{src.nom}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{src.url}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Fréquence : {src.frequence}
                    {src.dernier_scrape && ` · Dernier scrape : ${new Date(src.dernier_scrape).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                <button
                  onClick={() => toggleActif(src.id, src.actif)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${src.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {src.actif ? 'Actif' : 'Inactif'}
                </button>
              </div>

              {/* Résultat dernier scrape */}
              {(result || lastLog) && (
                <div className={`rounded-xl px-3 py-2 text-xs mb-3 ${
                  (result?.erreur || lastLog?.erreur) ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
                }`}>
                  {result ? (
                    result.erreur
                      ? `Erreur : ${result.erreur}`
                      : `${result.trouves} trouvés · ${result.doublons} doublons · ${result.inseres} insérés`
                  ) : lastLog ? (
                    lastLog.erreur
                      ? `Dernière erreur : ${lastLog.erreur}`
                      : `${lastLog.trouves} trouvés · ${lastLog.doublons} doublons · ${lastLog.inseres} insérés`
                  ) : null}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => scrapeNow(src.id)}
                  disabled={!!scraping}
                  className="flex-1 py-2 bg-[#C4622D] text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isScraping ? (
                    <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scraping...</>
                  ) : '▶ Scraper maintenant'}
                </button>
                <button
                  onClick={() => deleteSource(src.id)}
                  className="py-2 px-3 bg-red-50 text-red-400 text-xs font-bold rounded-xl"
                >
                  🗑️
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
