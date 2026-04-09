'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import DoublonsAdmin from '@/components/DoublonsAdmin'
import ZoneAdmin from '@/components/ZoneAdmin'

type Onglet   = 'a_traiter' | 'publie' | 'rejete' | 'scrap' | 'doublons' | 'zone'
type SortKey  = 'created_desc' | 'created_asc' | 'date_asc' | 'date_desc'
const PAGE_SIZE = 20

interface Feedback {
  id: string
  evenement_id: string
  evenement_titre: string
  message: string
  contact: string | null
  created_at: string
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'created_desc', label: 'Plus récents d\'abord' },
  { value: 'created_asc',  label: 'Plus anciens d\'abord' },
  { value: 'date_asc',     label: 'Date événement ↑' },
  { value: 'date_desc',    label: 'Date événement ↓' },
]

export default function AdminDashboard() {
  const [onglet, setOnglet]             = useState<Onglet>('a_traiter')
  const [evenements, setEvenements]     = useState<Evenement[]>([])
  const [feedbacks, setFeedbacks]       = useState<Feedback[]>([])
  const [loading, setLoading]           = useState(true)
  const [actionId, setActionId]         = useState<string | null>(null)
  const [selection, setSelection]       = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading]   = useState(false)
  const [masquerPasses, setMasquerPasses]   = useState(false)
  const [togglingConfig, setTogglingConfig] = useState(false)
  const [search, setSearch]             = useState('')
  const [sort, setSort]                 = useState<SortKey>('created_desc')
  const [page, setPage]                 = useState(1)
  const [onlyFeedbacks, setOnlyFeedbacks] = useState(false)
  const [expandedFeedback, setExpandedFeedback] = useState<Set<string>>(new Set())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: cfg }, fbRes] = await Promise.all([
      supabase.from('evenements')
        .select('id, titre, categorie, date_debut, statut, source, created_at, lieu_id, doublon_verifie, lieux(id, nom, commune, lat, lng, place_id_google)')
        .order('created_at', { ascending: false }),
      supabase.from('config').select('value').eq('key', 'masquer_passes').single(),
      fetch('/api/admin/feedbacks'),
    ])
    setEvenements((data as unknown as Evenement[]) ?? [])
    setMasquerPasses(cfg?.value === 'true')
    const fbData = fbRes.ok ? await fbRes.json() : []
    setFeedbacks(Array.isArray(fbData) ? fbData : [])
    setLoading(false)
  }, [])

  // Cleanup silencieux au chargement
  useEffect(() => {
    fetch('/api/admin/cleanup', { method: 'POST' }).catch(() => {})
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { setSelection(new Set()); setPage(1) }, [onglet])
  useEffect(() => { setPage(1) }, [search, sort, onlyFeedbacks])

  // Index feedbacks par evenement_id
  const feedbacksByEvent = useMemo(() => {
    const map = new Map<string, Feedback[]>()
    for (const fb of feedbacks) {
      if (!map.has(fb.evenement_id)) map.set(fb.evenement_id, [])
      map.get(fb.evenement_id)!.push(fb)
    }
    return map
  }, [feedbacks])

  const totalFeedbacks = feedbacks.length

  const toggleMasquerPasses = async () => {
    const next = !masquerPasses
    setTogglingConfig(true)
    setMasquerPasses(next)
    await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'masquer_passes', value: next }),
    })
    setTogglingConfig(false)
  }

  const setStatut = async (id: string, statut: string) => {
    setActionId(id)
    await fetch(`/api/admin/evenements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    })
    await fetchAll()
    setActionId(null)
  }

  const supprimer = async (id: string) => {
    if (!confirm('Supprimer cet événement ?')) return
    setActionId(id)
    await fetch(`/api/admin/evenements/${id}`, { method: 'DELETE' })
    await fetchAll()
    setActionId(null)
  }

  const marquerFeedbackTraite = async (fbId: string) => {
    await fetch(`/api/admin/feedbacks/${fbId}`, { method: 'DELETE' })
    setFeedbacks(prev => prev.filter(f => f.id !== fbId))
  }

  const supprimerSelection = async () => {
    if (!confirm(`Supprimer ${selection.size} événement(s) ?`)) return
    setBulkLoading(true)
    await Promise.all(Array.from(selection).map(id =>
      fetch(`/api/admin/evenements/${id}`, { method: 'DELETE' })
    ))
    setSelection(new Set())
    await fetchAll()
    setBulkLoading(false)
  }

  const publierSelection = async () => {
    if (!confirm(`Publier ${selection.size} événement(s) ?`)) return
    setBulkLoading(true)
    await Promise.all(Array.from(selection).map(id =>
      fetch(`/api/admin/evenements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'publie' }),
      })
    ))
    setSelection(new Set())
    await fetchAll()
    setBulkLoading(false)
  }

  const toggleSelect = (id: string) => {
    setSelection(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleExpandFeedback = (id: string) => {
    setExpandedFeedback(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // Filtrage par onglet
  const byOnglet = useMemo(() => evenements.filter(e => {
    if (onglet === 'scrap')     return e.source === 'scrape' && (e.statut === 'en_attente' || e.statut === 'a_verifier')
    if (onglet === 'a_traiter') return e.source !== 'scrape' && (e.statut === 'en_attente' || e.statut === 'a_verifier' || (e.statut === 'publie' && isApproxLocation(e.lieux)))
    return e.statut === onglet
  }), [evenements, onglet])

  // Filtre signalements
  const afterFbFilter = useMemo(() =>
    onlyFeedbacks ? byOnglet.filter(e => feedbacksByEvent.has(e.id)) : byOnglet
  , [byOnglet, onlyFeedbacks, feedbacksByEvent])

  // Recherche dynamique
  const q = search.trim().toLowerCase()
  const afterSearch = useMemo(() => {
    if (!q) return afterFbFilter
    return afterFbFilter.filter(e => {
      const titre   = (e.titre ?? '').toLowerCase()
      const lieu    = (e.lieux?.nom ?? '').toLowerCase()
      const commune = (e.lieux?.commune ?? '').toLowerCase()
      const desc    = (e.description ?? '').toLowerCase()
      return titre.includes(q) || lieu.includes(q) || commune.includes(q) || desc.includes(q)
    })
  }, [afterFbFilter, q])

  // Tri
  const sorted = useMemo(() => {
    const arr = [...afterSearch]
    if (onglet === 'a_traiter' && !q && !onlyFeedbacks) {
      arr.sort((a, b) => {
        const approxDiff = (isApproxLocation(a.lieux) ? 0 : 1) - (isApproxLocation(b.lieux) ? 0 : 1)
        if (approxDiff !== 0) return approxDiff
        return applySortKey(sort, a, b)
      })
      return arr
    }
    arr.sort((a, b) => applySortKey(sort, a, b))
    return arr
  }, [afterSearch, sort, onglet, q, onlyFeedbacks])

  const counts = {
    a_traiter: evenements.filter(e => e.source !== 'scrape' && (e.statut === 'en_attente' || e.statut === 'a_verifier' || (e.statut === 'publie' && isApproxLocation(e.lieux)))).length,
    publie:    evenements.filter(e => e.statut === 'publie').length,
    rejete:    evenements.filter(e => e.statut === 'rejete').length,
    scrap:     evenements.filter(e => e.source === 'scrape' && (e.statut === 'en_attente' || e.statut === 'a_verifier')).length,
  }

  const totalPages  = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allSelected = paginated.length > 0 && paginated.every(e => selection.has(e.id))
  const toggleAll   = () => {
    if (allSelected) setSelection(new Set())
    else setSelection(new Set(paginated.map(e => e.id)))
  }

  return (
    <div className="min-h-screen bg-[#FBF7F0] pb-24">
      {/* Header */}
      <div className="bg-[#2C1810] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] text-xl font-bold">←</Link>
        <h1 className="font-bold text-lg flex-1">Back-office</h1>
        <Link href="/admin/prompts" className="text-xs text-[#C4622D] font-semibold border border-[#C4622D] px-2 py-1 rounded-lg mr-1">
          IA
        </Link>
        <Link href="/admin/sources" className="text-xs text-[#C4622D] font-semibold border border-[#C4622D] px-2 py-1 rounded-lg mr-1">
          Sources
        </Link>
        <button onClick={fetchAll} className="text-xs text-gray-400 underline">Actualiser</button>
      </div>

      {/* Réglage : masquer les événements passés */}
      <div className="bg-[#3D2318] px-4 py-2.5 flex items-center gap-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1" onClick={toggleMasquerPasses}>
          <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${masquerPasses ? 'bg-orange-500' : 'bg-gray-600'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${masquerPasses ? 'left-5' : 'left-1'}`} />
          </div>
          <span className="text-sm text-gray-300 font-medium">Masquer les événements passés</span>
          {togglingConfig && <span className="text-xs text-gray-500">…</span>}
        </label>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${masquerPasses ? 'bg-orange-900 text-orange-300' : 'bg-gray-700 text-gray-400'}`}>
          {masquerPasses ? 'Actif' : 'Inactif'}
        </span>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-[#E8E0D5] bg-white overflow-x-auto">
        {([
          { key: 'a_traiter', label: 'À traiter', color: 'bg-orange-500' },
          { key: 'scrap',     label: 'Scrap',     color: 'bg-blue-500'   },
          { key: 'publie',    label: 'Publiés',   color: 'bg-green-500'  },
          { key: 'rejete',    label: 'Rejetés',   color: 'bg-gray-400'   },
          { key: 'doublons',  label: '🔀 Doublons', color: 'bg-amber-500'  },
          { key: 'zone',      label: '📍 Zone',     color: 'bg-teal-500'   },
        ] as { key: Onglet; label: string; color: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setOnglet(tab.key)}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap px-2 ${
              onglet === tab.key ? 'text-[#C4622D] border-b-2 border-[#C4622D]' : 'text-gray-400'
            }`}
          >
            {tab.label}
            {counts[tab.key as keyof typeof counts] > 0 && (
              <span className={`${tab.color} text-white text-xs rounded-full w-5 h-5 flex items-center justify-center`}>
                {counts[tab.key as keyof typeof counts]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Onglet Doublons */}
      {onglet === 'doublons' && <DoublonsAdmin />}

      {/* Onglet Zone */}
      {onglet === 'zone' && <ZoneAdmin />}

      {/* Bandeau info Scrap */}
      {onglet === 'scrap' && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-blue-700 font-medium">
            Événements issus du scraping — à valider avant publication
          </p>
          <Link href="/admin/sources" className="text-xs text-blue-600 underline">Gérer les sources</Link>
        </div>
      )}

      {/* Barre recherche + tri + filtre signalements */}
      {onglet !== 'doublons' && onglet !== 'zone' && (
        <div className="bg-white border-b border-[#E8E0D5] px-3 py-2 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Rechercher titre, lieu, commune…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-sm bg-[#FBF7F0] rounded-xl border border-[#E8E0D5] focus:outline-none focus:border-[#C4622D] text-[#2C1810] placeholder-gray-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">✕</button>
              )}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="text-xs bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-2 py-2 text-[#2C1810] focus:outline-none focus:border-[#C4622D] cursor-pointer"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Filtre signalements */}
          {totalFeedbacks > 0 && (
            <button
              onClick={() => setOnlyFeedbacks(p => !p)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                onlyFeedbacks
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-amber-50 text-amber-700 border-amber-300'
              }`}
            >
              ⚠️ {totalFeedbacks} signalement{totalFeedbacks > 1 ? 's' : ''} en attente
              {onlyFeedbacks ? ' — afficher tout' : ' — voir uniquement'}
            </button>
          )}
        </div>
      )}

      {/* Barre sélection */}
      {onglet !== 'doublons' && onglet !== 'zone' && !loading && sorted.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-[#E8E0D5]">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-[#C4622D] cursor-pointer" />
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </label>
          <span className="text-xs text-gray-400">
            {sorted.length} résultat{sorted.length > 1 ? 's' : ''}
            {selection.size > 0 && (
              <span className="ml-2 text-[#C4622D] font-semibold">
                · {selection.size} sélectionné{selection.size > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Liste */}
      {onglet !== 'doublons' && onglet !== 'zone' && <div className="p-3 space-y-3 pb-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            {search ? 'Aucun résultat pour cette recherche' : onlyFeedbacks ? 'Aucun signalement dans cet onglet' : onglet === 'scrap' ? 'Aucun événement à valider' : 'Aucun événement'}
          </p>
        ) : paginated.map(evt => {
          const cat            = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
          const approx         = isApproxLocation(evt.lieux)
          const isLoading      = actionId === evt.id
          const isSelected     = selection.has(evt.id)
          const evtFeedbacks   = feedbacksByEvent.get(evt.id) ?? []
          const hasFeedback    = evtFeedbacks.length > 0
          const fbExpanded     = expandedFeedback.has(evt.id)

          return (
            <div
              key={evt.id}
              className={`bg-white rounded-2xl p-4 border-2 transition-colors ${
                isSelected ? 'border-[#C4622D]' : hasFeedback ? 'border-amber-400' : approx ? 'border-orange-200' : 'border-transparent'
              } shadow-sm`}
            >
              {/* Badge signalement */}
              {hasFeedback && (
                <button
                  onClick={() => toggleExpandFeedback(evt.id)}
                  className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold mb-2 bg-amber-50 rounded-lg px-2 py-1.5 w-full text-left border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  <span>⚠️</span>
                  <span>{evtFeedbacks.length} signalement{evtFeedbacks.length > 1 ? 's' : ''} utilisateur</span>
                  <span className="ml-auto text-amber-400">{fbExpanded ? '▲' : '▼'}</span>
                </button>
              )}

              {/* Messages feedback dépliés */}
              {hasFeedback && fbExpanded && (
                <div className="mb-3 space-y-2">
                  {evtFeedbacks.map(fb => (
                    <div key={fb.id} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <p className="text-xs text-[#2C1810] leading-relaxed">{fb.message}</p>
                      {fb.contact && (
                        <p className="text-xs text-gray-400 mt-1">Contact : {fb.contact}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">
                          {new Date(fb.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => marquerFeedbackTraite(fb.id)}
                          className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          ✓ Traité
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {approx && (
                <div className="flex items-center gap-1.5 text-xs text-orange-500 font-semibold mb-2 bg-orange-50 rounded-lg px-2 py-1">
                  📍 Localisation approximative — à corriger
                </div>
              )}

              <div className="flex items-start gap-2 mb-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(evt.id)}
                  className="w-4 h-4 accent-[#C4622D] cursor-pointer mt-1 shrink-0"
                />
                <span
                  className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full text-white mt-0.5"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2C1810] leading-tight">{evt.titre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {evt.date_debut ? formatDate(evt.date_debut) : 'Sans date'}
                    {evt.lieux ? ` · ${evt.lieux.nom}` : ''}
                    {evt.lieux?.commune ? `, ${evt.lieux.commune}` : ''}
                  </p>
                </div>
                <StatutBadge statut={evt.statut} />
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                {evt.statut !== 'publie' && (
                  <button
                    onClick={() => setStatut(evt.id, 'publie')}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    ✓ Publier
                  </button>
                )}
                {evt.statut === 'publie' && (
                  <button
                    onClick={() => setStatut(evt.id, 'en_attente')}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-orange-400 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    ⏸ Dépublier
                  </button>
                )}
                {evt.statut !== 'rejete' && (
                  <button
                    onClick={() => setStatut(evt.id, 'rejete')}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-gray-300 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    ✗ Rejeter
                  </button>
                )}
                <Link
                  href={`/admin/evenement/${evt.id}`}
                  className="flex-1 py-1.5 bg-[#FBF7F0] text-[#C4622D] text-xs font-bold rounded-lg text-center border border-[#C4622D]"
                >
                  ✏️ Éditer
                </Link>
                <button
                  onClick={() => supprimer(evt.id)}
                  disabled={isLoading}
                  className="py-1.5 px-3 bg-red-50 text-red-400 text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  🗑️
                </button>
              </div>
            </div>
          )
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#E8E0D5] text-[#2C1810] disabled:opacity-30"
            >← Préc.</button>
            <span className="text-xs text-gray-500 font-medium">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#E8E0D5] text-[#2C1810] disabled:opacity-30"
            >Suiv. →</button>
          </div>
        )}
      </div>}

      {/* Barre flottante sélection */}
      {selection.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#2C1810] px-4 py-3 flex items-center gap-2 shadow-2xl">
          <span className="text-white text-sm font-semibold flex-1">
            {selection.size} sélectionné{selection.size > 1 ? 's' : ''}
          </span>
          <button onClick={() => setSelection(new Set())} className="text-gray-400 text-sm px-3 py-2 rounded-lg">
            Annuler
          </button>
          {(onglet === 'scrap' || onglet === 'a_traiter') && (
            <button
              onClick={publierSelection}
              disabled={bulkLoading}
              className="bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {bulkLoading ? '...' : `✓ Publier (${selection.size})`}
            </button>
          )}
          <button
            onClick={supprimerSelection}
            disabled={bulkLoading}
            className="bg-red-500 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {bulkLoading ? '...' : `Supprimer (${selection.size})`}
          </button>
        </div>
      )}
    </div>
  )
}

function applySortKey(sort: SortKey, a: Evenement, b: Evenement): number {
  if (sort === 'created_desc') return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  if (sort === 'created_asc')  return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  if (sort === 'date_asc')     return (a.date_debut ?? '').localeCompare(b.date_debut ?? '')
  if (sort === 'date_desc')    return (b.date_debut ?? '').localeCompare(a.date_debut ?? '')
  return 0
}

function StatutBadge({ statut }: { statut: string }) {
  const styles: Record<string, string> = {
    publie:      'bg-green-100 text-green-700',
    en_attente:  'bg-orange-100 text-orange-600',
    rejete:      'bg-gray-100 text-gray-500',
    archive:     'bg-gray-100 text-gray-400',
    a_verifier:  'bg-amber-100 text-amber-700',
  }
  const labels: Record<string, string> = {
    publie:     'Publié',
    en_attente: 'En attente',
    rejete:     'Rejeté',
    archive:    'Archivé',
    a_verifier: 'À vérifier',
  }
  return (
    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${styles[statut] ?? ''}`}>
      {labels[statut] ?? statut}
    </span>
  )
}
