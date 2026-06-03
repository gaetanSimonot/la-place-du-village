'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/swr-fetchers'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import DoublonsAdmin from '@/components/DoublonsAdmin'
import ZoneAdmin from '@/components/ZoneAdmin'
import MembresAdmin from '@/components/MembresAdmin'
import ProduceurAdmin from '@/components/ProduceurAdmin'
import DemandesAdmin from '@/components/DemandesAdmin'
import EventEditDrawer from '@/components/EventEditDrawer'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type Section    = 'evenements' | 'etablissements' | 'parametres'
type EventTab   = 'tous' | 'collector' | 'soumission' | 'scrap'
type SubFilter  = 'publies' | 'a_traiter' | 'rejetes'
type ParamPanel =
  | 'config'
  | 'membres'
  | 'demandes'
  | 'signalements'
  | 'doublons'
  | 'zone'
  | 'admins'
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

/** Sources par onglet. `null` = pas de filtre source (vue globale "Tous"). */
const SOURCES_BY_TAB: Record<EventTab, string[] | null> = {
  tous:       null,
  collector:  ['whatsapp', 'signal'],
  soumission: ['formulaire'],
  scrap:      ['scrape'],
}

const STATUTS_BY_FILTER: Record<SubFilter, string[]> = {
  publies:   ['publie'],
  a_traiter: ['en_attente', 'a_verifier'],
  rejetes:   ['rejete', 'archive'],
}

const TAB_LABELS: Record<EventTab, string> = {
  tous:       '✨ Tous',
  collector:  '📥 Collector',
  soumission: '👥 Soumissions',
  scrap:      '🌐 Scrap',
}

const FILTER_LABELS: Record<SubFilter, string> = {
  publies:   'Publiés',
  a_traiter: 'À traiter',
  rejetes:   'Rejetés',
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp:   '💬 WhatsApp',
  signal:     '💬 Signal',
  formulaire: '✍️ Formulaire',
  scrape:     '🌐 Scrape',
}

// Couleurs de badge par source (cohérent avec AdminInbox)
const SOURCE_BADGE_COLORS: Record<string, string> = {
  whatsapp:   'bg-green-100 text-green-700',
  signal:     'bg-blue-100 text-blue-700',
  formulaire: 'bg-purple-100 text-purple-700',
  scrape:     'bg-gray-100 text-gray-600',
}

// ─────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [adminVerified, setAdminVerified] = useState(false)

  // Auth guard
  useEffect(() => {
    if (adminVerified) return
    if (authLoading) return
    if (!user?.email) { router.replace('/'); return }
    supabase.from('admin_emails').select('email').eq('email', user.email).maybeSingle()
      .then(({ data, error }) => {
        if (error) return
        if (!data) router.replace('/')
        else {
          setAdminVerified(true)
          try { localStorage.setItem('pdv-admin-ok', user.email!) } catch {}
        }
      })
  }, [adminVerified, authLoading, user, router])

  // ── Section / sous-onglet / sous-filtre ──
  const initialSection: Section = (() => {
    const s = searchParams?.get('section')
    if (s === 'evenements' || s === 'etablissements' || s === 'parametres') return s
    return 'evenements'
  })()

  const [section, setSection]       = useState<Section>(initialSection)
  const [evtTab, setEvtTab]         = useState<EventTab>('tous')
  const [subFilter, setSubFilter]   = useState<SubFilter>('a_traiter')
  const [paramPanel, setParamPanel] = useState<ParamPanel>('config')

  // ── Data state ──
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [feedbacks, setFeedbacks]   = useState<Feedback[]>([])
  const [loading, setLoading]       = useState(true)
  const [actionId, setActionId]     = useState<string | null>(null)
  const [selection, setSelection]   = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)

  // ── Counts par onglet (juste "à traiter" pour le badge) ──
  const [tabCounts, setTabCounts] = useState<Record<EventTab, number>>({
    tous: 0, collector: 0, soumission: 0, scrap: 0,
  })
  const [demandesCount, setDemandesCount] = useState(0)

  // ── Config admin (sous-panel "config") ──
  const [masquerPasses, setMasquerPasses]       = useState(false)
  const [togglingConfig, setTogglingConfig]     = useState(false)
  const [maintenanceMode, setMaintenanceMode]   = useState(false)
  const [togglingMaint, setTogglingMaint]       = useState(false)
  const [mapProvider, setMapProvider]           = useState<'google' | 'maplibre'>('google')
  const [togglingMap, setTogglingMap]           = useState(false)
  const [hubSubtitle, setHubSubtitle]           = useState('')
  const [hubSubtitleInput, setHubSubtitleInput] = useState('')
  const [savingSubtitle, setSavingSubtitle]     = useState(false)

  // ── Admins list (sous-panel "admins") ──
  const [adminList, setAdminList]         = useState<{ email: string; created_at: string }[]>([])
  const [adminInput, setAdminInput]       = useState('')
  const [adminLoading, setAdminLoading]   = useState(false)
  const [adminError, setAdminError]       = useState('')

  // ── Recherche / tri / pagination (liste events) ──
  const [search, setSearch] = useState('')
  const [sort, setSort]     = useState<SortKey>('created_desc')
  const [page, setPage]     = useState(1)
  const [onlyFeedbacks, setOnlyFeedbacks] = useState(false)
  const [expandedFeedback, setExpandedFeedback] = useState<Set<string>>(new Set())

  // ─────────────────────────────────────────────────────────
  // Fetchers
  // ─────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async (tab: EventTab, sub: SubFilter) => {
    setLoading(true)
    let query = supabase
      .from('evenements')
      .select('id, titre, description, categorie, date_debut, statut, source, source_groupe, source_auteur, source_telephone, created_at, lieu_id, doublon_verifie, image_url, image_position, promotion, submitted_by, submitted_by_name, vote_count, publish_at, lieux(id, nom, commune, lat, lng, place_id_google)')
      .in('statut', STATUTS_BY_FILTER[sub])
      .order('created_at', { ascending: false })
      .limit(100)
    const sources = SOURCES_BY_TAB[tab]
    if (sources) query = query.in('source', sources)
    const { data } = await query
    setEvenements((data as unknown as Evenement[]) ?? [])
    setLoading(false)
  }, [])

  const fetchTabCounts = useCallback(async () => {
    const [cAll, c1, c2, c3] = await Promise.all([
      supabase.from('evenements').select('id', { count: 'exact', head: true })
        .in('statut', STATUTS_BY_FILTER.a_traiter),
      supabase.from('evenements').select('id', { count: 'exact', head: true })
        .in('source', SOURCES_BY_TAB.collector!).in('statut', STATUTS_BY_FILTER.a_traiter),
      supabase.from('evenements').select('id', { count: 'exact', head: true })
        .in('source', SOURCES_BY_TAB.soumission!).in('statut', STATUTS_BY_FILTER.a_traiter),
      supabase.from('evenements').select('id', { count: 'exact', head: true })
        .in('source', SOURCES_BY_TAB.scrap!).in('statut', STATUTS_BY_FILTER.a_traiter),
    ])
    setTabCounts({
      tous:       cAll.count ?? 0,
      collector:  c1.count ?? 0,
      soumission: c2.count ?? 0,
      scrap:      c3.count ?? 0,
    })
  }, [])

  const fetchFeedbacks = useCallback(async () => {
    const res = await authedFetch('/api/admin/feedbacks')
    const data = res.ok ? await res.json() : []
    setFeedbacks(Array.isArray(data) ? data : [])
  }, [])

  const fetchAdmins = useCallback(async () => {
    const res = await authedFetch('/api/admin/admins')
    if (res.ok) setAdminList(await res.json())
  }, [])

  const fetchConfig = useCallback(async () => {
    const [{ data: cfg }, { data: subCfg }, { data: maintCfg }, { data: mapCfg }] = await Promise.all([
      supabase.from('config').select('value').eq('key', 'masquer_passes').maybeSingle(),
      supabase.from('config').select('value').eq('key', 'hub_subtitle').maybeSingle(),
      supabase.from('config').select('value').eq('key', 'maintenance_mode').maybeSingle(),
      supabase.from('config').select('value').eq('key', 'map_provider').maybeSingle(),
    ])
    setMasquerPasses(cfg?.value === 'true')
    setMaintenanceMode(maintCfg?.value === 'true')
    setMapProvider(mapCfg?.value === 'maplibre' ? 'maplibre' : 'google')
    const sub = subCfg?.value ?? 'Tout le village, à portée de main'
    setHubSubtitle(sub)
    setHubSubtitleInput(sub)
  }, [])

  // ─────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────

  // Cleanup silencieux au chargement (admin uniquement)
  useEffect(() => {
    authedFetch('/api/admin/cleanup', { method: 'POST' }).catch(() => {})
  }, [])

  // Fetch initial après auth OK
  useEffect(() => {
    if (!adminVerified) return
    fetchEvents(evtTab, subFilter)
    fetchTabCounts()
    fetchFeedbacks()
    fetchConfig()
  }, [adminVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh events à chaque changement onglet/filtre
  useEffect(() => {
    if (!adminVerified) return
    setSelection(new Set())
    setPage(1)
    fetchEvents(evtTab, subFilter)
  }, [evtTab, subFilter, adminVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch admins quand on bascule sur le panel admins
  useEffect(() => {
    if (section === 'parametres' && paramPanel === 'admins') fetchAdmins()
  }, [section, paramPanel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Badge "Demandes" count
  useEffect(() => {
    if (!adminVerified) return
    supabase
      .from('commerce_requests')
      .select('id', { count: 'exact', head: true })
      .eq('traite', false)
      .then(({ count }) => setDemandesCount(count ?? 0))
  }, [adminVerified, section, paramPanel])

  // Sync section depuis query param
  useEffect(() => {
    const s = searchParams?.get('section')
    if (s === 'evenements' || s === 'etablissements' || s === 'parametres') setSection(s)
  }, [searchParams])

  useEffect(() => { setPage(1) }, [search, sort, onlyFeedbacks])

  // ─────────────────────────────────────────────────────────
  // Memoized derivations
  // ─────────────────────────────────────────────────────────

  const feedbacksByEvent = useMemo(() => {
    const map = new Map<string, Feedback[]>()
    for (const fb of feedbacks) {
      if (!map.has(fb.evenement_id)) map.set(fb.evenement_id, [])
      map.get(fb.evenement_id)!.push(fb)
    }
    return map
  }, [feedbacks])

  const totalFeedbacks = feedbacks.length

  const afterFbFilter = useMemo(() =>
    onlyFeedbacks ? evenements.filter(e => feedbacksByEvent.has(e.id)) : evenements
  , [evenements, onlyFeedbacks, feedbacksByEvent])

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

  const sorted = useMemo(() => {
    const arr = [...afterSearch]
    // Sur "À traiter" du collector ou de soumission, on priorise les lieux approximatifs
    if (subFilter === 'a_traiter' && !q && !onlyFeedbacks) {
      arr.sort((a, b) => {
        const approxDiff = (isApproxLocation(a.lieux) ? 0 : 1) - (isApproxLocation(b.lieux) ? 0 : 1)
        if (approxDiff !== 0) return approxDiff
        return applySortKey(sort, a, b)
      })
      return arr
    }
    arr.sort((a, b) => applySortKey(sort, a, b))
    return arr
  }, [afterSearch, sort, subFilter, q, onlyFeedbacks])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allSelected = paginated.length > 0 && paginated.every(e => selection.has(e.id))
  const toggleAll   = () => {
    if (allSelected) setSelection(new Set())
    else setSelection(new Set(paginated.map(e => e.id)))
  }

  // ─────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────

  const toggleMasquerPasses = async () => {
    const next = !masquerPasses
    setTogglingConfig(true)
    const prev = masquerPasses
    setMasquerPasses(next)  // optimistic
    const res = await authedFetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'masquer_passes', value: next }),
    })
    if (!res.ok) {
      setMasquerPasses(prev)  // rollback
      toast.error('Échec sauvegarde')
    }
    setTogglingConfig(false)
  }

  const toggleMaintenance = async () => {
    const next = !maintenanceMode
    setTogglingMaint(true)
    const prev = maintenanceMode
    setMaintenanceMode(next)  // optimistic
    const res = await authedFetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'maintenance_mode', value: next }),
    })
    if (!res.ok) {
      setMaintenanceMode(prev)  // rollback
      toast.error('Échec sauvegarde')
    }
    setTogglingMaint(false)
  }

  const toggleMapProvider = async () => {
    const next = mapProvider === 'maplibre' ? 'google' : 'maplibre'
    const prev = mapProvider
    setTogglingMap(true)
    setMapProvider(next)  // optimistic
    const res = await authedFetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'map_provider', value: next }),
    })
    if (!res.ok) {
      setMapProvider(prev)  // rollback
      toast.error('Échec sauvegarde')
    }
    setTogglingMap(false)
  }

  const saveHubSubtitle = async () => {
    const next = hubSubtitleInput.trim()
    if (!next || next === hubSubtitle) return
    setSavingSubtitle(true)
    const res = await authedFetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'hub_subtitle', value: next }),
    })
    if (res.ok) setHubSubtitle(next)
    else toast.error('Échec sauvegarde')
    setSavingSubtitle(false)
  }

  const setStatut = async (id: string, statut: string) => {
    setActionId(id)
    const res = await authedFetch(`/api/admin/evenements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    })
    if (!res.ok) {
      toast.error(res.status === 401 || res.status === 403 ? 'Accès refusé' : 'Erreur statut')
      setActionId(null)
      return
    }
    await fetchEvents(evtTab, subFilter)
    fetchTabCounts()
    setActionId(null)
  }

  const supprimer = async (id: string) => {
    if (!confirm('Supprimer cet événement ?')) return
    setActionId(id)
    const res = await authedFetch(`/api/admin/evenements/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(res.status === 401 || res.status === 403 ? 'Accès refusé' : 'Erreur suppression')
      setActionId(null)
      return
    }
    setEvenements(prev => prev.filter(e => e.id !== id))
    fetchTabCounts()
    setActionId(null)
  }

  const marquerFeedbackTraite = async (fbId: string) => {
    const res = await authedFetch(`/api/admin/feedbacks/${fbId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Erreur'); return }
    setFeedbacks(prev => prev.filter(f => f.id !== fbId))
  }

  const supprimerSelection = async () => {
    if (!confirm(`Supprimer ${selection.size} événement(s) ?`)) return
    setBulkLoading(true)
    const ids = Array.from(selection)
    const results = await Promise.all(
      ids.map(id => authedFetch(`/api/admin/evenements/${id}`, { method: 'DELETE' })),
    )
    const okIds = ids.filter((_, i) => results[i].ok)
    const failedCount = ids.length - okIds.length
    if (okIds.length) setEvenements(prev => prev.filter(e => !okIds.includes(e.id)))
    setSelection(new Set())
    if (failedCount > 0) toast.error(`${failedCount} suppression(s) échouée(s)`)
    fetchTabCounts()
    // Resync au cas où certains échecs auraient laissé des fantômes dans l'UI
    if (failedCount > 0) await fetchEvents(evtTab, subFilter)
    setBulkLoading(false)
  }

  const publierSelection = async () => {
    if (!confirm(`Publier ${selection.size} événement(s) ?`)) return
    setBulkLoading(true)
    const ids = Array.from(selection)
    const results = await Promise.all(ids.map(id =>
      authedFetch(`/api/admin/evenements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'publie' }),
      }),
    ))
    const failedCount = results.filter(r => !r.ok).length
    if (failedCount > 0) toast.error(`${failedCount} publication(s) échouée(s)`)
    setSelection(new Set())
    await fetchEvents(evtTab, subFilter)
    fetchTabCounts()
    setBulkLoading(false)
  }

  const toggleSelect = (id: string) => {
    setSelection(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpandFeedback = (id: string) => {
    setExpandedFeedback(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addAdmin = async () => {
    const email = adminInput.trim().toLowerCase()
    if (!email.includes('@')) return
    setAdminLoading(true); setAdminError('')
    const res = await authedFetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) setAdminError(json.error ?? 'Erreur')
    else { setAdminInput(''); fetchAdmins() }
    setAdminLoading(false)
  }

  const removeAdmin = async (email: string) => {
    if (!confirm(`Retirer ${email} des admins ?`)) return
    const res = await authedFetch('/api/admin/admins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) { toast.error('Erreur'); return }
    fetchAdmins()
  }

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  if (authLoading || !adminVerified) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#C4622D', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  const totalATraiter = tabCounts.tous

  return (
    <div className="min-h-screen bg-[#FBF7F0] pb-24">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="bg-[#2C1810] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] text-xl font-bold">←</Link>
        <h1 className="font-bold text-lg flex-1">Back-office</h1>
        <button
          onClick={() => { fetchEvents(evtTab, subFilter); fetchTabCounts(); fetchFeedbacks() }}
          className="text-xs text-gray-400 underline"
        >↺</button>
      </div>

      {/* ─── Nav 3 sections ─────────────────────────────────── */}
      <div className="flex border-b-2 border-[#E8E0D5] bg-white">
        {([
          { key: 'evenements',    label: '📅 Événements',    badge: totalATraiter },
          { key: 'etablissements', label: '🗺 Établissements', badge: 0 },
          { key: 'parametres',    label: '⚙️ Paramètres',    badge: demandesCount + totalFeedbacks },
        ] as { key: Section; label: string; badge: number }[]).map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap px-1 ${
              section === s.key ? 'text-[#C4622D] border-b-2 border-[#C4622D]' : 'text-gray-400'
            }`}
          >
            {s.label}
            {s.badge > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{s.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION ÉVÉNEMENTS                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      {section === 'evenements' && (
        <>
          {/* Onglets source : Tous / Collector / Soumission / Scrap */}
          <div className="flex border-b border-[#E8E0D5] bg-white overflow-x-auto">
            {(['tous', 'collector', 'soumission', 'scrap'] as EventTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setEvtTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors px-1.5 ${
                  evtTab === tab ? 'text-[#C4622D] border-b-2 border-[#C4622D]' : 'text-gray-400'
                }`}
              >
                {TAB_LABELS[tab]}
                {tabCounts[tab] > 0 && (
                  <span className="bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {tabCounts[tab]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sous-filtres statut : Publiés / À traiter / Rejetés */}
          <div className="flex border-b border-[#E8E0D5] bg-[#FBF7F0] gap-1 px-3 py-2 overflow-x-auto">
            {(['publies', 'a_traiter', 'rejetes'] as SubFilter[]).map(f => {
              const active = subFilter === f
              return (
                <button
                  key={f}
                  onClick={() => setSubFilter(f)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#C4622D] text-white'
                      : 'bg-white text-gray-500 border border-[#E8E0D5]'
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              )
            })}
            <label className="ml-auto flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none" onClick={toggleMasquerPasses}>
              <div className={`relative w-8 h-4 rounded-full transition-colors ${masquerPasses ? 'bg-orange-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${masquerPasses ? 'left-4' : 'left-0.5'}`} />
              </div>
              Masquer passés
              {togglingConfig && <span className="text-xs text-gray-400">…</span>}
            </label>
          </div>

          {/* Bandeau info contextuel */}
          {evtTab === 'scrap' && (
            <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between">
              <p className="text-xs text-blue-700 font-medium">
                Événements issus du scraping
              </p>
              <Link href="/admin/sources" className="text-xs text-blue-600 underline">Gérer les sources</Link>
            </div>
          )}

          {/* Barre recherche + tri */}
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

          {/* Barre sélection */}
          {!loading && sorted.length > 0 && (
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
          <div className="p-3 space-y-3 pb-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sorted.length === 0 ? (
              <p className="text-center text-gray-400 py-12">
                {search ? 'Aucun résultat pour cette recherche'
                  : onlyFeedbacks ? 'Aucun signalement dans cet onglet'
                  : `Aucun événement ${FILTER_LABELS[subFilter].toLowerCase()} dans ${TAB_LABELS[evtTab]}`}
              </p>
            ) : paginated.map(evt => (
              <EventCard
                key={evt.id}
                evt={evt}
                isSelected={selection.has(evt.id)}
                isLoading={actionId === evt.id}
                feedbacks={feedbacksByEvent.get(evt.id) ?? []}
                fbExpanded={expandedFeedback.has(evt.id)}
                onSelect={() => toggleSelect(evt.id)}
                onEdit={() => setEditId(evt.id)}
                onStatut={(s) => setStatut(evt.id, s)}
                onDelete={() => supprimer(evt.id)}
                onToggleFbExpand={() => toggleExpandFeedback(evt.id)}
                onMarkFbTraite={marquerFeedbackTraite}
              />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#E8E0D5] text-[#2C1810] disabled:opacity-30">← Préc.</button>
                <span className="text-xs text-gray-500 font-medium">Page {page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#E8E0D5] text-[#2C1810] disabled:opacity-30">Suiv. →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION ÉTABLISSEMENTS                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {section === 'etablissements' && <ProduceurAdmin embedded />}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION PARAMÈTRES (fourre-tout)                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {section === 'parametres' && (
        <ParametersSection
          panel={paramPanel}
          setPanel={setParamPanel}
          demandesCount={demandesCount}
          feedbacksCount={totalFeedbacks}
          // config
          masquerPasses={masquerPasses}
          togglingConfig={togglingConfig}
          onToggleMasquer={toggleMasquerPasses}
          maintenanceMode={maintenanceMode}
          togglingMaint={togglingMaint}
          onToggleMaintenance={toggleMaintenance}
          mapProvider={mapProvider}
          togglingMap={togglingMap}
          onToggleMapProvider={toggleMapProvider}
          hubSubtitle={hubSubtitle}
          hubSubtitleInput={hubSubtitleInput}
          savingSubtitle={savingSubtitle}
          onChangeHubInput={setHubSubtitleInput}
          onSaveHub={saveHubSubtitle}
          // admins
          adminList={adminList}
          adminInput={adminInput}
          adminLoading={adminLoading}
          adminError={adminError}
          userEmail={user?.email ?? null}
          onChangeAdminInput={setAdminInput}
          onAddAdmin={addAdmin}
          onRemoveAdmin={removeAdmin}
          // signalements
          feedbacks={feedbacks}
          onOpenEvent={(id) => { setSection('evenements'); setEditId(id) }}
          onMarkFbTraite={marquerFeedbackTraite}
        />
      )}

      {/* ─── Drawer édition (global) ───────────────────────── */}
      {editId && (
        <EventEditDrawer
          evenementId={editId}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); fetchEvents(evtTab, subFilter); fetchTabCounts() }}
        />
      )}

      {/* ─── Barre flottante sélection ─────────────────────── */}
      {section === 'evenements' && selection.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#2C1810] px-4 py-3 flex items-center gap-2 shadow-2xl">
          <span className="text-white text-sm font-semibold flex-1">
            {selection.size} sélectionné{selection.size > 1 ? 's' : ''}
          </span>
          <button onClick={() => setSelection(new Set())} className="text-gray-400 text-sm px-3 py-2 rounded-lg">
            Annuler
          </button>
          {subFilter === 'a_traiter' && (
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

// ─────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────

interface EventCardProps {
  evt: Evenement
  isSelected: boolean
  isLoading: boolean
  feedbacks: Feedback[]
  fbExpanded: boolean
  onSelect: () => void
  onEdit: () => void
  onStatut: (s: string) => void
  onDelete: () => void
  onToggleFbExpand: () => void
  onMarkFbTraite: (fbId: string) => void
}

function EventCard({ evt, isSelected, isLoading, feedbacks, fbExpanded, onSelect, onEdit, onStatut, onDelete, onToggleFbExpand, onMarkFbTraite }: EventCardProps) {
  const cat            = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const approx         = isApproxLocation(evt.lieux)
  const hasFeedback    = feedbacks.length > 0
  const sourceLabel    = evt.source ? (SOURCE_LABELS[evt.source] ?? evt.source) : null
  const sourceBadge    = evt.source ? (SOURCE_BADGE_COLORS[evt.source] ?? 'bg-gray-100 text-gray-600') : ''

  return (
    <div
      className={`bg-white rounded-2xl p-4 border-2 transition-colors ${
        isSelected ? 'border-[#C4622D]' : hasFeedback ? 'border-amber-400' : approx ? 'border-orange-200' : 'border-transparent'
      } shadow-sm`}
    >
      {/* Badge signalement */}
      {hasFeedback && (
        <button
          onClick={onToggleFbExpand}
          className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold mb-2 bg-amber-50 rounded-lg px-2 py-1.5 w-full text-left border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <span>⚠️</span>
          <span>{feedbacks.length} signalement{feedbacks.length > 1 ? 's' : ''} utilisateur</span>
          <span className="ml-auto text-amber-400">{fbExpanded ? '▲' : '▼'}</span>
        </button>
      )}

      {hasFeedback && fbExpanded && (
        <div className="mb-3 space-y-2">
          {feedbacks.map(fb => (
            <div key={fb.id} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs text-[#2C1810] leading-relaxed">{fb.message}</p>
              {fb.contact && <p className="text-xs text-gray-400 mt-1">Contact : {fb.contact}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {new Date(fb.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => onMarkFbTraite(fb.id)}
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

      {evt.image_url && (
        <div className="relative w-full rounded-xl overflow-hidden mb-2 cursor-pointer" style={{ height: 120, backgroundColor: '#f0ece6' }}
          onClick={onEdit}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={evt.image_url} alt="" className="w-full h-full object-cover"
            style={{ objectPosition: evt.image_position ?? '50% 50%' }} />
        </div>
      )}

      <div className="flex items-start gap-2 mb-1">
        <input
          type="checkbox" checked={isSelected} onChange={onSelect}
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
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
            {sourceLabel && (
              <span className={`font-semibold px-1.5 py-0.5 rounded-md ${sourceBadge}`}>
                {sourceLabel}
              </span>
            )}
            {evt.source_groupe && (
              <span className="font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                📁 {evt.source_groupe}
              </span>
            )}
            {evt.source_auteur && (
              <span className="text-gray-500">
                👤 {evt.source_auteur}
                {evt.source_telephone && <span className="text-gray-400"> · {evt.source_telephone}</span>}
              </span>
            )}
            {evt.submitted_by_name && !evt.source_auteur && (
              <span className="text-orange-500 font-medium">👤 {evt.submitted_by_name}</span>
            )}
            {(evt.vote_count ?? 0) > 0 && (
              <span className="text-blue-500">👍 {evt.vote_count}</span>
            )}
          </div>
        </div>
        <StatutBadge statut={evt.statut} />
        {evt.promotion && evt.promotion !== 'basic' && (
          <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${evt.promotion === 'max' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-600'}`}>
            {evt.promotion === 'max' ? '⚡ Max' : '★ Pro'}
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {evt.statut !== 'publie' && (
          <button onClick={() => onStatut('publie')} disabled={isLoading}
            className="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50">
            ✓ Publier
          </button>
        )}
        {evt.statut === 'publie' && (
          <button onClick={() => onStatut('en_attente')} disabled={isLoading}
            className="flex-1 py-1.5 bg-orange-400 text-white text-xs font-bold rounded-lg disabled:opacity-50">
            ⏸ Dépublier
          </button>
        )}
        {evt.statut !== 'rejete' && (
          <button onClick={() => onStatut('rejete')} disabled={isLoading}
            className="flex-1 py-1.5 bg-gray-300 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-50">
            ✗ Rejeter
          </button>
        )}
        <button onClick={onEdit}
          className="flex-1 py-1.5 bg-[#FBF7F0] text-[#C4622D] text-xs font-bold rounded-lg text-center border border-[#C4622D]">
          ✏️ Éditer
        </button>
        <button onClick={onDelete} disabled={isLoading}
          className="py-1.5 px-3 bg-red-50 text-red-400 text-xs font-bold rounded-lg disabled:opacity-50">
          🗑️
        </button>
      </div>
    </div>
  )
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

function applySortKey(sort: SortKey, a: Evenement, b: Evenement): number {
  if (sort === 'created_desc') return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  if (sort === 'created_asc')  return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  if (sort === 'date_asc')     return (a.date_debut ?? '').localeCompare(b.date_debut ?? '')
  if (sort === 'date_desc')    return (b.date_debut ?? '').localeCompare(a.date_debut ?? '')
  return 0
}

// ─────────────────────────────────────────────────────────
// Section Paramètres (menu + panels)
// ─────────────────────────────────────────────────────────

interface ParamProps {
  panel: ParamPanel
  setPanel: (p: ParamPanel) => void
  demandesCount: number
  feedbacksCount: number
  // config
  masquerPasses: boolean
  togglingConfig: boolean
  onToggleMasquer: () => void
  maintenanceMode: boolean
  togglingMaint: boolean
  onToggleMaintenance: () => void
  mapProvider: 'google' | 'maplibre'
  togglingMap: boolean
  onToggleMapProvider: () => void
  hubSubtitle: string
  hubSubtitleInput: string
  savingSubtitle: boolean
  onChangeHubInput: (v: string) => void
  onSaveHub: () => void
  // admins
  adminList: { email: string; created_at: string }[]
  adminInput: string
  adminLoading: boolean
  adminError: string
  userEmail: string | null
  onChangeAdminInput: (v: string) => void
  onAddAdmin: () => void
  onRemoveAdmin: (email: string) => void
  // signalements
  feedbacks: Feedback[]
  onOpenEvent: (id: string) => void
  onMarkFbTraite: (fbId: string) => void
}

function ParametersSection(p: ParamProps) {
  const panels: { key: ParamPanel; label: string; emoji: string; badge?: number }[] = [
    { key: 'config',       label: 'Config affichage',    emoji: '⚙️' },
    { key: 'admins',       label: 'Administrateurs',     emoji: '👤' },
    { key: 'membres',      label: 'Membres',             emoji: '👥' },
    { key: 'demandes',     label: 'Demandes',            emoji: '📋', badge: p.demandesCount },
    { key: 'signalements', label: 'Signalements',        emoji: '⚠️', badge: p.feedbacksCount },
    { key: 'doublons',     label: 'Outils doublons',     emoji: '🔀' },
    { key: 'zone',         label: 'Outils zone géo',     emoji: '📍' },
  ]

  return (
    <div className="bg-[#FBF7F0] min-h-[calc(100vh-200px)]">
      {/* Menu sous-panels */}
      <div className="flex gap-1.5 px-3 py-3 overflow-x-auto bg-white border-b border-[#E8E0D5]">
        {panels.map(pn => (
          <button
            key={pn.key}
            onClick={() => p.setPanel(pn.key)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              p.panel === pn.key
                ? 'bg-[#C4622D] text-white'
                : 'bg-[#FBF7F0] text-gray-600 border border-[#E8E0D5]'
            }`}
          >
            <span>{pn.emoji}</span>
            <span>{pn.label}</span>
            {pn.badge !== undefined && pn.badge > 0 && (
              <span className={`text-[10px] rounded-full w-4 h-4 flex items-center justify-center ${
                p.panel === pn.key ? 'bg-white text-[#C4622D]' : 'bg-orange-500 text-white'
              }`}>{pn.badge}</span>
            )}
          </button>
        ))}
        <Link
          href="/admin/sources"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#FBF7F0] text-gray-600 border border-[#E8E0D5] whitespace-nowrap"
        >🌐 Sources scrap</Link>
        <Link
          href="/admin/prompts"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#FBF7F0] text-gray-600 border border-[#E8E0D5] whitespace-nowrap"
        >🧠 Prompts IA</Link>
        <Link
          href="/admin/support"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#FBF7F0] text-gray-600 border border-[#E8E0D5] whitespace-nowrap"
        >📨 Support</Link>
      </div>

      {/* Panels */}
      {p.panel === 'config' && (
        <div className="p-4 max-w-md mx-auto space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-[#2C1810] text-sm mb-3">Affichage agenda</p>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={p.onToggleMasquer}>
              <div className={`relative w-10 h-6 rounded-full transition-colors ${p.masquerPasses ? 'bg-orange-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${p.masquerPasses ? 'left-5' : 'left-1'}`} />
              </div>
              <span className="text-sm text-[#2C1810]">Masquer les événements passés</span>
              {p.togglingConfig && <span className="text-xs text-gray-400">…</span>}
            </label>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-orange-200">
            <p className="font-bold text-[#2C1810] text-sm mb-1">⚠️ Mode maintenance</p>
            <p className="text-xs text-gray-500 mb-3">
              Affiche un écran de maintenance à tous les visiteurs (sauf admins et /admin).
              Filet de secours : <code>?nomaint=1</code> dans l&apos;URL.
            </p>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={p.onToggleMaintenance}>
              <div className={`relative w-10 h-6 rounded-full transition-colors ${p.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${p.maintenanceMode ? 'left-5' : 'left-1'}`} />
              </div>
              <span className="text-sm font-semibold text-[#2C1810]">
                {p.maintenanceMode ? 'Maintenance ACTIVE' : 'Maintenance désactivée'}
              </span>
              {p.togglingMaint && <span className="text-xs text-gray-400">…</span>}
            </label>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-[#2C1810] text-sm mb-1">🗺️ Fond de carte</p>
            <p className="text-xs text-gray-500 mb-3">
              Bascule la carte de TOUTE l&apos;app pour tous les visiteurs. « Carte libre »
              (gratuite, sans filigrane) à utiliser si la facturation Google coince.
            </p>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={p.onToggleMapProvider}>
              <div className={`relative w-10 h-6 rounded-full transition-colors ${p.mapProvider === 'maplibre' ? 'bg-green-600' : 'bg-gray-300'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${p.mapProvider === 'maplibre' ? 'left-5' : 'left-1'}`} />
              </div>
              <span className="text-sm font-semibold text-[#2C1810]">
                {p.mapProvider === 'maplibre' ? 'Carte libre (gratuite)' : 'Google Maps'}
              </span>
              {p.togglingMap && <span className="text-xs text-gray-400">…</span>}
            </label>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-[#2C1810] text-sm mb-1">Sous-titre du hub</p>
            <p className="text-xs text-gray-400 mb-3">Affiché sous «La Place du Village» sur l&apos;écran d&apos;accueil.</p>
            <div className="flex gap-2">
              <input
                type="text" value={p.hubSubtitleInput}
                onChange={e => p.onChangeHubInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && p.onSaveHub()}
                maxLength={80}
                placeholder="Tout le village, à portée de main"
                className="flex-1 border border-[#E0D8CE] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C4622D] bg-[#FBF7F0]"
              />
              <button
                onClick={p.onSaveHub}
                disabled={p.savingSubtitle || p.hubSubtitleInput.trim() === p.hubSubtitle || !p.hubSubtitleInput.trim()}
                className="bg-[#C4622D] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
              >
                {p.savingSubtitle ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {p.panel === 'admins' && (
        <div className="p-4 max-w-md mx-auto">
          <h2 className="font-bold text-[#2C1810] text-base mb-3">Administrateurs</h2>
          <div className="space-y-2 mb-4">
            {p.adminList.map(a => (
              <div key={a.email} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm">
                <span className="text-sm font-medium text-[#2C1810]">{a.email}</span>
                {a.email !== p.userEmail ? (
                  <button onClick={() => p.onRemoveAdmin(a.email)} className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">Retirer</button>
                ) : (
                  <span className="text-xs text-[#C4622D] font-semibold">Vous</span>
                )}
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm font-bold text-[#2C1810] mb-3">Ajouter un admin</p>
            <div className="flex gap-2">
              <input
                type="email" value={p.adminInput}
                onChange={e => p.onChangeAdminInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && p.onAddAdmin()}
                placeholder="email@exemple.com"
                className="flex-1 border border-[#E0D8CE] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C4622D] bg-[#FBF7F0]"
              />
              <button onClick={p.onAddAdmin} disabled={p.adminLoading || !p.adminInput.includes('@')}
                className="bg-[#C4622D] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40">
                {p.adminLoading ? '…' : 'Ajouter'}
              </button>
            </div>
            {p.adminError && <p className="text-xs text-red-500 mt-2">{p.adminError}</p>}
          </div>
        </div>
      )}

      {p.panel === 'membres'  && <MembresAdmin />}
      {p.panel === 'demandes' && <DemandesAdmin />}
      {p.panel === 'doublons' && <DoublonsAdmin />}
      {p.panel === 'zone'     && <ZoneAdmin />}

      {p.panel === 'signalements' && (
        <div className="p-3 space-y-3 pb-10">
          {p.feedbacks.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Aucun signalement en attente</p>
          ) : p.feedbacks.map(fb => (
            <div key={fb.id} className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-amber-500 text-lg">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2C1810] text-sm truncate">{fb.evenement_titre || '(événement supprimé)'}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(fb.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <p className="text-sm text-[#2C1810] leading-relaxed mb-2">{fb.message}</p>
              {fb.contact && (
                <p className="text-xs text-gray-500 mb-2">Contact : <span className="text-[#2C1810]">{fb.contact}</span></p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => p.onOpenEvent(fb.evenement_id)}
                  className="flex-1 py-1.5 bg-[#FBF7F0] text-[#C4622D] text-xs font-bold rounded-lg border border-[#C4622D]"
                >
                  ✏️ Voir l&apos;événement
                </button>
                <button
                  onClick={() => p.onMarkFbTraite(fb.id)}
                  className="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg"
                >
                  ✓ Marquer traité
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
