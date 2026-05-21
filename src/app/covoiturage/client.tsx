'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import RatingStars from '@/components/RatingStars'
import { JOURS_SEMAINE, type Covoiturage, type CovoitSens, type JourSemaine } from '@/lib/covoiturage'

type Conducteur = {
  display_name: string | null
  avatar_url: string | null
  genre: string | null
  is_verified: boolean
  note_moyenne: number | null
  nombre_avis: number
}

type CovoitWithProf = Covoiturage & { conducteur: Conducteur | null }

type SortKey = 'date_asc' | 'price_asc' | 'rating_desc' | 'detour_asc'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date_asc',    label: 'Date la plus proche' },
  { key: 'price_asc',   label: 'Prix le plus bas' },
  { key: 'rating_desc', label: 'Mieux noté' },
  { key: 'detour_asc',  label: 'Moins de détour' },
]

const COMFORT_KEYS = ['verified', 'non_fumeur', 'animaux', 'bagages'] as const
type ComfortKey = typeof COMFORT_KEYS[number]

const COMFORT_LABELS: Record<ComfortKey, string> = {
  verified:   'Profil vérifié',
  non_fumeur: 'Non-fumeur',
  animaux:    'Animaux acceptés',
  bagages:    'Bagages acceptés',
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.getTime() === today.getTime())    return "Aujourd'hui"
  if (d.getTime() === tomorrow.getTime()) return 'Demain'
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

export default function CovoiturageListClient() {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [covoits, setCovoits] = useState<CovoitWithProf[]>([])
  const [loading, setLoading] = useState(true)

  // Recherche texte
  const [depart, setDepart]           = useState('')
  const [destination, setDestination] = useState('')

  // Filtres avancés
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sens, setSens]               = useState<CovoitSens | 'tous'>('tous')
  const [jours, setJours]             = useState<JourSemaine[]>([])
  const [regularite, setRegularite]   = useState<'tous' | 'regulier' | 'ponctuel'>('tous')
  const [prixMax, setPrixMax]         = useState(20)
  const [detourMax, setDetourMax]     = useState(30)
  const [comfort, setComfort]         = useState<Partial<Record<ComfortKey, boolean>>>({})
  const [sort, setSort]               = useState<SortKey>('date_asc')

  const toggleJour = (j: JourSemaine) =>
    setJours(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j])
  const toggleComfort = (k: ComfortKey) =>
    setComfort(prev => ({ ...prev, [k]: !prev[k] }))

  const resetFilters = () => {
    setSens('tous')
    setJours([])
    setRegularite('tous')
    setPrixMax(20)
    setDetourMax(30)
    setComfort({})
    setSort('date_asc')
  }

  const activeFilterCount =
    (sens !== 'tous' ? 1 : 0) +
    jours.length +
    (regularite !== 'tous' ? 1 : 0) +
    (prixMax < 20 ? 1 : 0) +
    (detourMax < 30 ? 1 : 0) +
    Object.values(comfort).filter(Boolean).length

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depart)            params.set('depart', depart)
    if (destination)       params.set('destination', destination)
    if (sens !== 'tous')   params.set('sens', sens)
    if (regularite === 'regulier') params.set('regulier', 'true')
    if (regularite === 'ponctuel') params.set('regulier', 'false')
    if (prixMax < 20)      params.set('prix_max',   String(prixMax))
    if (detourMax < 30)    params.set('detour_max', String(detourMax))
    const res = await fetch(`/api/covoiturages?${params.toString()}`)
    const data = await res.json()
    setCovoits((data.covoiturages ?? []) as CovoitWithProf[])
    setLoading(false)
  }, [depart, destination, sens, regularite, prixMax, detourMax])

  useEffect(() => { load() }, [load])

  // Realtime sur covoiturages
  useEffect(() => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
    const ch = supabase
      .channel(`covoit-list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'covoiturages' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // Filtrage et tri côté client (jours + confort + tri)
  const visible = useMemo(() => {
    let arr = covoits.slice()
    if (jours.length > 0) {
      arr = arr.filter(c =>
        c.regulier
          ? jours.some(j => c.jours_semaine.includes(j))
          : true  // on garde les ponctuels (le filtre date du serveur suffit)
      )
    }
    if (comfort.verified)   arr = arr.filter(c => !!c.conducteur?.is_verified)
    if (comfort.non_fumeur) arr = arr.filter(c => !c.fumeur)
    if (comfort.animaux)    arr = arr.filter(c => c.animaux)
    if (comfort.bagages)    arr = arr.filter(c => c.bagages)
    const cmp: Record<SortKey, (a: CovoitWithProf, b: CovoitWithProf) => number> = {
      date_asc:    (a, b) => (a.date_trajet + (a.heure_depart ?? '')).localeCompare(b.date_trajet + (b.heure_depart ?? '')),
      price_asc:   (a, b) => a.prix - b.prix,
      rating_desc: (a, b) => (b.conducteur?.note_moyenne ?? 0) - (a.conducteur?.note_moyenne ?? 0),
      detour_asc:  (a, b) => a.detour_minutes - b.detour_minutes,
    }
    return arr.sort(cmp[sort])
  }, [covoits, jours, comfort, sort])

  const handleProposer = () => {
    if (!user) { openAuthModal('/covoiturage/nouveau'); return }
    window.location.href = '/covoiturage/nouveau'
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* ─── Top bar ────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Covoiturage
          </div>
          <div className="mt-0.5 text-[10.5px] font-medium text-texte-doux">
            Service gratuit · entre voisins
          </div>
        </div>
        <Link
          href="/covoiturage/mes-conversations"
          aria-label="Mes conversations"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </Link>
      </div>

      {/* ─── Recherche départ/destination ────────────────── */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-bord bg-white p-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-cremeDeep px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <input
                value={depart}
                onChange={e => setDepart(e.target.value)}
                placeholder="Départ"
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-texte outline-none placeholder:text-texte-tres-doux"
              />
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-cremeDeep px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
              <input
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="Destination"
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-texte outline-none placeholder:text-texte-tres-doux"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Sens + bouton filtres + tri ─────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 gap-1 rounded-xl bg-cremeDeep p-1">
          {(['tous', 'aller', 'retour'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSens(s)}
              className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors ${
                sens === s ? 'bg-white text-primary shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'text-texte-doux'
              }`}
            >
              {s === 'tous' ? 'Tous' : s === 'aller' ? 'Aller' : 'Retour'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFiltersOpen(true)}
          className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-bord bg-white px-3 text-[12px] font-bold text-texte"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
          </svg>
          Filtres
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-white">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* ─── CTA Proposer un trajet ──────────────────────── */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={handleProposer}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-[14px] font-bold text-white"
          style={{ boxShadow: '0 4px 14px rgba(45,90,61,0.25)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Proposer un trajet
        </button>
      </div>

      {/* ─── Liste résultats ─────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-2 px-4">
        {loading && <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>}
        {!loading && visible.length === 0 && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">Aucun trajet</p>
            <p className="m-0 text-[12px] text-texte-doux">
              {activeFilterCount > 0
                ? 'Élargis les filtres ou essaie sans.'
                : 'Sois le premier à en proposer un.'}
            </p>
          </div>
        )}
        {!loading && visible.map(c => <CovoitCard key={c.id} c={c} />)}
      </div>

      {/* ─── Filtres drawer (modal bottom) ───────────────── */}
      {filtersOpen && (
        <FiltersDrawer
          onClose={() => setFiltersOpen(false)}
          jours={jours} toggleJour={toggleJour}
          regularite={regularite} setRegularite={setRegularite}
          prixMax={prixMax} setPrixMax={setPrixMax}
          detourMax={detourMax} setDetourMax={setDetourMax}
          comfort={comfort} toggleComfort={toggleComfort}
          sort={sort} setSort={setSort}
          activeCount={activeFilterCount}
          onReset={resetFilters}
        />
      )}

      <BottomNavBar />
    </main>
  )
}

// ─────────────────────────────────────────────────────────
// Card résultat
// ─────────────────────────────────────────────────────────

function CovoitCard({ c }: { c: CovoitWithProf }) {
  const placesRestantes = c.places - c.places_prises
  const conducteurName  = c.conducteur?.display_name ?? 'Conducteur'

  return (
    <Link
      href={`/covoiturage/${c.id}`}
      className="block rounded-2xl border border-bord bg-white p-3.5 no-underline transition-colors hover:border-bordSoft"
    >
      {/* Top : date + statut */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">
            {fmtDate(c.date_trajet)}
          </span>
          {c.heure_depart && (
            <span className="text-[11px] font-bold text-texte">{c.heure_depart}</span>
          )}
          {c.heure_arrivee && (
            <span className="text-[11px] text-texte-doux">→ {c.heure_arrivee}</span>
          )}
        </div>
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase"
          style={{
            background: c.statut === 'complet' ? '#FFF0E5' : '#E8F2EB',
            color:      c.statut === 'complet' ? '#C84B2F' : '#2D5A3D',
          }}
        >
          {c.statut === 'complet' ? 'Complet' : `${placesRestantes} place${placesRestantes > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Trajet : depart → destination */}
      <div className="mt-2 flex min-w-0 items-center gap-2 text-[14px] font-bold text-texte">
        <span className="min-w-0 flex-1 truncate">{c.depart}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>
        </svg>
        <span className="min-w-0 flex-1 truncate">{c.destination}</span>
      </div>

      {/* Régulier : mini-jours */}
      {c.regulier && c.jours_semaine.length > 0 && (
        <div className="mt-2 flex gap-1">
          {JOURS_SEMAINE.map(d => (
            <span
              key={d.key}
              className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${
                c.jours_semaine.includes(d.key)
                  ? 'bg-primary-light text-primary'
                  : 'bg-cremeDeep text-texte-tres-doux'
              }`}
            >
              {d.label[0]}
            </span>
          ))}
          {c.detour_minutes > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-texte-doux">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="4" r="2"/><path d="M8 22l1-7 4-4 4 5h-2"/>
              </svg>
              ≤ {c.detour_minutes} min
            </span>
          )}
        </div>
      )}

      {/* Bottom : conducteur + rating + badges + prix */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-bordSoft pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={conducteurName} url={c.conducteur?.avatar_url} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[12px] font-bold text-texte">
              <span className="truncate">{conducteurName}</span>
              {c.conducteur?.is_verified && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#2D5A3D" stroke="#fff" strokeWidth="2" className="shrink-0" aria-label="Profil vérifié">
                  <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/>
                </svg>
              )}
            </div>
            {(c.conducteur?.nombre_avis ?? 0) > 0 ? (
              <RatingStars value={c.conducteur?.note_moyenne} count={c.conducteur?.nombre_avis} size={11} />
            ) : (
              <span className="text-[10px] text-texte-tres-doux">Pas encore d&apos;avis</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!c.fumeur && <span title="Non-fumeur" className="text-[12px]" aria-label="Non-fumeur">🚭</span>}
          {c.animaux && <span title="Animaux" className="text-[12px]" aria-label="Animaux acceptés">🐶</span>}
          {c.bagages && <span title="Bagages" className="text-[12px]" aria-label="Bagages acceptés">🎒</span>}
          <span className="ml-1 rounded-md bg-cremeDeep px-2 py-0.5 text-[12px] font-bold text-texte">
            {c.prix > 0 ? `${c.prix.toFixed(2).replace(/\.00$/, '')} €` : 'Gratuit'}
          </span>
        </div>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────
// Drawer filtres (bottom modal)
// ─────────────────────────────────────────────────────────

interface DrawerProps {
  onClose: () => void
  jours: JourSemaine[]
  toggleJour: (j: JourSemaine) => void
  regularite: 'tous' | 'regulier' | 'ponctuel'
  setRegularite: (r: 'tous' | 'regulier' | 'ponctuel') => void
  prixMax: number
  setPrixMax: (n: number) => void
  detourMax: number
  setDetourMax: (n: number) => void
  comfort: Partial<Record<ComfortKey, boolean>>
  toggleComfort: (k: ComfortKey) => void
  sort: SortKey
  setSort: (s: SortKey) => void
  activeCount: number
  onReset: () => void
}

function FiltersDrawer(p: DrawerProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={p.onClose}
        aria-hidden
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white pb-8 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Poignée */}
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-full bg-bord" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <h2 className="m-0 font-serif text-[18px] font-semibold text-texte">Filtres</h2>
            {p.activeCount > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-extrabold text-white">
                {p.activeCount}
              </span>
            )}
          </div>
          <button onClick={p.onReset} className="text-[12px] font-medium text-texte-doux underline">
            Réinitialiser
          </button>
        </div>

        {/* Jours */}
        <Section title="Jours">
          <div className="flex gap-1.5">
            {JOURS_SEMAINE.map(d => (
              <button
                key={d.key}
                onClick={() => p.toggleJour(d.key)}
                className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-[12px] font-bold transition-colors ${
                  p.jours.includes(d.key)
                    ? 'border-primary bg-primary-light text-primary'
                    : 'border-bord bg-white text-texte'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Régularité */}
        <Section title="Régularité">
          <div className="flex gap-2">
            {([
              ['tous',     'Tous les trajets'],
              ['regulier', 'Réguliers'],
              ['ponctuel', 'Ponctuels'],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => p.setRegularite(k)}
                className={`flex-1 rounded-xl border py-2 text-[12px] font-bold transition-colors ${
                  p.regularite === k
                    ? 'border-primary bg-primary-light text-primary'
                    : 'border-bord bg-white text-texte'
                }`}
              >{l}</button>
            ))}
          </div>
        </Section>

        {/* Prix max */}
        <Section title="Participation max">
          <div className="mb-2 font-serif text-[20px] font-semibold text-texte">
            {p.prixMax} €
            <span className="ml-2 font-sans text-[12px] font-medium text-texte-doux">par trajet</span>
          </div>
          <input
            type="range" min={0} max={20} step={1}
            value={p.prixMax} onChange={e => p.setPrixMax(+e.target.value)}
            className="w-full accent-primary"
          />
        </Section>

        {/* Détour max */}
        <Section title="Détour max">
          <div className="mb-2 font-serif text-[20px] font-semibold text-texte">
            {p.detourMax} min
            <span className="ml-2 font-sans text-[12px] font-medium text-texte-doux">jusqu&apos;au point de RDV</span>
          </div>
          <input
            type="range" min={0} max={30} step={1}
            value={p.detourMax} onChange={e => p.setDetourMax(+e.target.value)}
            className="w-full accent-primary"
          />
        </Section>

        {/* Confort */}
        <Section title="Confiance & confort">
          {COMFORT_KEYS.map(k => (
            <label
              key={k}
              className="flex w-full cursor-pointer items-center justify-between py-2"
            >
              <span className="text-[13px] text-texte">{COMFORT_LABELS[k]}</span>
              <button
                type="button"
                onClick={() => p.toggleComfort(k)}
                className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                  p.comfort[k] ? 'bg-primary' : 'bg-bord'
                }`}
                aria-pressed={!!p.comfort[k]}
                aria-label={COMFORT_LABELS[k]}
              >
                <span
                  className={`absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    p.comfort[k] ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
          ))}
        </Section>

        {/* Tri */}
        <Section title="Trier par">
          {SORTS.map(s => (
            <label key={s.key} className="flex w-full cursor-pointer items-center gap-3 py-2">
              <button
                type="button"
                onClick={() => p.setSort(s.key)}
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  p.sort === s.key ? 'border-primary' : 'border-bord'
                }`}
                aria-pressed={p.sort === s.key}
              >
                {p.sort === s.key && <span className="h-2 w-2 rounded-full bg-primary" />}
              </button>
              <span className="text-[13px] text-texte">{s.label}</span>
            </label>
          ))}
        </Section>

        {/* Bouton de validation */}
        <div className="sticky bottom-0 bg-white/95 px-5 pb-4 pt-3 backdrop-blur">
          <button
            onClick={p.onClose}
            className="w-full rounded-2xl bg-primary py-3 text-[14px] font-bold text-white"
            style={{ boxShadow: '0 4px 14px rgba(45,90,61,0.25)' }}
          >
            Voir les résultats
          </button>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-bordSoft px-5 py-4 first:border-t-0">
      <p className="m-0 mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">{title}</p>
      {children}
    </div>
  )
}
