'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTerritoire } from '@/components/TerritoireProvider'

/** Helper local : récupère les headers avec token Bearer pour les routes
 *  /api/admin/sources et /api/scrape-source, protégées par requireAdmin. */
async function adminHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const out: Record<string, string> = { ...(extra ?? {}) }
  if (session?.access_token) out.Authorization = `Bearer ${session.access_token}`
  return out
}

interface Source {
  id: string
  nom: string
  url: string
  actif: boolean
  frequence: string
  type?: string
  rayon_km?: number | null
  horizon_jours?: number | null
  publier_auto?: boolean | null
  dernier_scrape: string | null
  created_at: string
  scrape_logs: { id: string; created_at: string; trouves: number; doublons: number; inseres: number; erreur: string | null }[]
}

interface ScrapeEventItem {
  titre: string
  statut: string
  doublon: boolean
}

interface RegleRapport {
  cle: string
  titre: string
  description: string | null
  commune: string | null
  lieu_nom: string | null
  jour: string
  heure: string | null
  periode_texte: string | null
  serie_cle: string
  verdict: 'retenue' | 'hors_zone' | 'sans_lieu' | 'irreguliere'
  distance_km: number | null
  commentaire: string | null
  occurrences: string[]
  inserees: number
}

interface ScrapeResult {
  mode?: 'recurrent' | 'structure'
  dryRun?: boolean
  trouves: number
  doublons: number
  inseres: number
  erreur?: string
  error?: string
  evenements?: ScrapeEventItem[]
  reglages?: { rayon_km: number | null; horizon_jours: number; publier_auto: boolean; statut_cible: string }
  totaux?: {
    regles_trouvees: number; regles_retenues: number; regles_hors_zone: number
    regles_sans_lieu: number; regles_irregulieres: number
    occurrences_prevues: number; occurrences_creees: number; occurrences_ignorees: number
  }
  regles?: RegleRapport[]
  /** Mode « structure » : ce que la source a vraiment livré, champ par champ. */
  qualite?: {
    detaillees: number; avec_image: number; avec_heure: number
    avec_description: number; avec_adresse: number; avec_lieu: number
  }
  geocodages?: number
  interrompu?: boolean
}

/**
 * LA SANTÉ D'UNE SOURCE, LUE DANS SON JOURNAL.
 *
 * Une source ne meurt pas bruyamment : le site refait son design, la page
 * déménage, et elle rend zéro pendant trois mois sans que personne le
 * remarque. Le journal de chaque passage est déjà en base — il suffit de le
 * lire, aucune colonne à ajouter.
 *
 * Trois états :
 *   muette   — les DEUX derniers passages n'ont rien trouvé : à regarder ;
 *   en baisse — elle rapporte beaucoup moins qu'avant : le site a bougé ;
 *   vivante  — rien à signaler.
 *
 * On exige DEUX passages vides et non un : un site en travaux un mardi soir
 * ne doit pas déclencher une alerte.
 */
type Sante = { etat: 'vivante' | 'baisse' | 'muette'; detail: string } | null

function santeDeLaSource(logs: Source['scrape_logs']): Sante {
  const j = [...(logs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)
  if (j.length < 2) return null
  const rien = (l: { trouves: number }) => (l.trouves ?? 0) === 0
  if (rien(j[0]) && rien(j[1])) {
    const suite = j.findIndex(l => !rien(l))
    const n = suite < 0 ? j.length : suite
    return { etat: 'muette', detail: n + ' passage' + (n > 1 ? 's' : '') + ' sans rien trouver' }
  }
  // Une chute franche par rapport à ce que la source donnait d'habitude.
  const precedents = j.slice(1).map(l => l.trouves ?? 0).filter(n => n > 0)
  if (precedents.length >= 2) {
    const habituel = precedents.reduce((a, b) => a + b, 0) / precedents.length
    if (habituel >= 5 && (j[0].trouves ?? 0) < habituel * 0.4) {
      return { etat: 'baisse', detail: Math.round(j[0].trouves) + ' au lieu de ~' + Math.round(habituel) }
    }
  }
  return { etat: 'vivante', detail: '' }
}

const COULEUR_SANTE: Record<'vivante' | 'baisse' | 'muette', string> = {
  vivante: 'bg-green-100 text-green-700',
  baisse:  'bg-amber-100 text-amber-700',
  muette:  'bg-red-100 text-red-700',
}

const VERDICTS: Record<RegleRapport['verdict'], { label: string; color: string }> = {
  retenue:     { label: 'Retenu',      color: 'bg-green-100 text-green-700' },
  hors_zone:   { label: 'Hors zone',   color: 'bg-gray-100 text-gray-500' },
  sans_lieu:   { label: 'Lieu inconnu', color: 'bg-orange-100 text-orange-700' },
  irreguliere: { label: 'À la main',   color: 'bg-amber-100 text-amber-700' },
}

export default function SourcesPage() {
  /* L'ecran administre UNE ville : sa reception, ses sources, ses fiches. */
  const { territoire } = useTerritoire()
  const qTerr = territoire?.slug ? `?territoire=${encodeURIComponent(territoire.slug)}` : ''

  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState<string | null>(null)
  const [scrapeResult, setScrapeResult] = useState<Record<string, ScrapeResult>>({})
  const [rapport, setRapport] = useState<ScrapeResult & { sourceName: string } | null>(null)
  const [form, setForm] = useState({
    nom: '', url: '', frequence: '24h',
    type: 'evenements', rayon_km: '50', horizon_jours: '42', publier_auto: false,
    indice_geo: 'Cévennes, France',
  })
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const fetchSources = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/sources${qTerr}`, { headers: await adminHeaders() })
    const data = await res.json()
    setSources(data.sources ?? [])
    setLoading(false)
  }, [qTerr])

  useEffect(() => { fetchSources() }, [fetchSources])

  const addSource = async () => {
    if (!form.nom.trim() || !form.url.trim()) return
    setAdding(true)
    const payload = form.type === 'recurrent'
      ? form
      : { nom: form.nom, url: form.url, frequence: form.frequence, type: 'evenements' }
    await fetch(`/api/admin/sources${qTerr}`, {
      method: 'POST',
      headers: await adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
    setForm({
      nom: '', url: '', frequence: '24h', type: 'evenements',
      rayon_km: '50', horizon_jours: '42', publier_auto: false, indice_geo: 'Cévennes, France',
    })
    setShowForm(false)
    await fetchSources()
    setAdding(false)
  }

  const toggleActif = async (id: string, actif: boolean) => {
    await fetch(`/api/admin/sources/${id}`, {
      method: 'PATCH',
      headers: await adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ actif: !actif }),
    })
    await fetchSources()
  }

  const deleteSource = async (id: string) => {
    if (!confirm('Supprimer cette source ?')) return
    await fetch(`/api/admin/sources/${id}`, { method: 'DELETE', headers: await adminHeaders() })
    await fetchSources()
  }

  /*
   * LANCER UN SCRAPE, ET NE JAMAIS LAISSER L'ÉCRAN TOURNER DANS LE VIDE.
   *
   * Un passage dure deux à trois minutes. Le navigateur, lui, ne tient pas
   * toujours une requête aussi longue : il coupe, `fetch` lève, et sans
   * `finally` le rouage ne se relâchait jamais — l'écran tournait
   * indéfiniment alors que le serveur avait fini son travail et tout écrit.
   *
   * Quand la réponse se perd, on va lire le JOURNAL de la source : le travail
   * a eu lieu, son bilan est en base, et le montrer vaut mieux que de laisser
   * croire à un échec.
   */
  const lancer = async (id: string, nom: string, dryRun: boolean) => {
    if (!dryRun && !confirm(`Scraper « ${nom} » et écrire en base ?`)) return
    setScraping(id)
    setScrapeResult(r => ({ ...r, [id]: undefined as unknown as ScrapeResult }))
    try {
      const res = await fetch(`/api/scrape-source?id=${id}${dryRun ? '&dryRun=1' : ''}`, {
        headers: await adminHeaders(),
      })
      const data = await res.json()
      setScrapeResult(r => ({ ...r, [id]: data }))
      if (!data.erreur && !data.error) setRapport({ ...data, sourceName: nom })
    } catch {
      const data = (!dryRun && await dernierBilan(id)) || {
        trouves: 0, doublons: 0, inseres: 0,
        erreur: 'La réponse s’est perdue en route. Rouvre cette page dans un instant : '
          + 'si le passage a abouti, son bilan apparaîtra dans le journal de la source.',
      }
      setScrapeResult(r => ({ ...r, [id]: data }))
      setRapport({ ...data, sourceName: nom })
    } finally {
      if (!dryRun) await fetchSources()
      setScraping(null)
    }
  }

  /**
   * Le dernier passage enregistré pour cette source.
   *
   * La liste des sources porte déjà leur journal : on la relit plutôt que
   * d'ajouter une route pour ça.
   */
  const dernierBilan = async (id: string): Promise<ScrapeResult | null> => {
    try {
      // Avec le territoire : sans lui, la liste retombe sur le territoire par
      // defaut et la source cherchee n'y figure pas.
      const r = await fetch(`/api/admin/sources${qTerr}`, { headers: await adminHeaders() })
      if (!r.ok) return null
      const j = await r.json()
      const src = (j.sources ?? []).find((x: Source) => x.id === id)
      const log = [...(src?.scrape_logs ?? [])]
        .sort((x, y) => y.created_at.localeCompare(x.created_at))[0]
      if (!log) return null
      return {
        trouves: log.trouves ?? 0, doublons: log.doublons ?? 0, inseres: log.inseres ?? 0,
        erreur: log.erreur ?? undefined,
      }
    } catch { return null }
  }

  const statutLabel = (s: string) => {
    if (s === 'publie')     return { label: 'Publié', color: 'bg-green-100 text-green-700' }
    if (s === 'en_attente') return { label: 'À valider', color: 'bg-blue-100 text-blue-700' }
    if (s === 'a_verifier') return { label: 'À vérifier', color: 'bg-orange-100 text-orange-700' }
    if (s === 'archive')    return { label: 'Doublon', color: 'bg-gray-100 text-gray-500' }
    return { label: s, color: 'bg-gray-100 text-gray-500' }
  }

  const estRecurrent = form.type === 'recurrent'

  return (
    <div className="min-h-screen bg-[#FBF7F0]">

      {/* Modal rapport */}
      {rapport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setRapport(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85dvh] flex flex-col" onClick={e => e.stopPropagation()}>

            <div className="flex items-center gap-3 px-4 py-4 border-b border-[#E8E0D5]">
              <div className="min-w-0">
                <p className="font-bold text-[#2C1810] truncate">Rapport — {rapport.sourceName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rapport.mode === 'recurrent' && rapport.totaux
                    ? `${rapport.totaux.regles_trouvees} règles · ${rapport.totaux.regles_retenues} retenues · ${rapport.totaux.occurrences_prevues} dates`
                    : `${rapport.trouves} trouvés · ${rapport.doublons} déjà connus · ${rapport.inseres} insérés`}
                </p>
              </div>
              <button onClick={() => setRapport(null)} className="ml-auto text-gray-400 text-xl leading-none shrink-0">✕</button>
            </div>

            {/* Bandeau aperçu */}
            {rapport.dryRun && (
              <div className="bg-blue-50 text-blue-700 text-xs px-4 py-2.5 border-b border-blue-100">
                <b>Aperçu</b> — rien n&apos;a été écrit en base. Voici ce qui serait créé.
              </div>
            )}

            <div className="overflow-y-auto px-4 py-3 space-y-3">

              {/*
                  CE QUE LA SOURCE A VRAIMENT LIVRÉ.
                  Un compte d'insérés ne dit pas si les fiches sont présentables.
                  Ces quatre chiffres-là le disent, et c'est ce qu'on veut savoir
                  avant de laisser une source publier toute seule.
              */}
              {rapport.qualite && rapport.qualite.detaillees > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {([
                      ['Avec image', rapport.qualite.avec_image],
                      ['Avec lieu situé', rapport.qualite.avec_lieu],
                      ['Avec description', rapport.qualite.avec_description],
                      ['Avec horaire', rapport.qualite.avec_heure],
                    ] as const).map(([label, n]) => (
                      <div key={label} className="bg-[#FBF7F0] rounded-xl px-3 py-2">
                        <p className="text-gray-400">{label}</p>
                        <p className="font-bold text-[#2C1810] text-base">
                          {n}<span className="text-gray-400 font-normal text-xs"> / {rapport.qualite!.detaillees}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Lu dans les données que le site publie lui-même — aucun modèle n&apos;est
                    intervenu{typeof rapport.geocodages === 'number'
                      ? `, ${rapport.geocodages} adresse${rapport.geocodages > 1 ? 's' : ''} envoyée${rapport.geocodages > 1 ? 's' : ''} à Google`
                      : ''}.
                  </p>
                  {rapport.interrompu && (
                    <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-3 py-2">
                      Arrêté au temps imparti — il reste des fiches à lire. Relance :
                      rien n&apos;est refait deux fois, le passage suivant reprend la suite.
                    </p>
                  )}
                </div>
              )}

              {/* ── Rapport source récurrente ── */}
              {rapport.mode === 'recurrent' && rapport.totaux ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#FBF7F0] rounded-xl px-3 py-2">
                      <p className="text-gray-400">Rendez-vous retenus</p>
                      <p className="font-bold text-[#2C1810] text-base">{rapport.totaux.regles_retenues}</p>
                    </div>
                    <div className="bg-[#FBF7F0] rounded-xl px-3 py-2">
                      <p className="text-gray-400">Dates {rapport.dryRun ? 'prévues' : 'créées'}</p>
                      <p className="font-bold text-[#2C1810] text-base">
                        {rapport.dryRun ? rapport.totaux.occurrences_prevues : rapport.totaux.occurrences_creees}
                      </p>
                    </div>
                  </div>

                  {!rapport.dryRun && rapport.totaux.occurrences_ignorees > 0 && (
                    <p className="text-xs text-gray-500 bg-[#FBF7F0] rounded-xl px-3 py-2">
                      {rapport.totaux.occurrences_ignorees} date{rapport.totaux.occurrences_ignorees > 1 ? 's' : ''} déjà
                      en base, ignorée{rapport.totaux.occurrences_ignorees > 1 ? 's' : ''} — le verrou anti-doublon a fait son travail.
                    </p>
                  )}

                  {rapport.reglages && (
                    <p className="text-[11px] text-gray-400">
                      Rayon {rapport.reglages.rayon_km ?? 'global'} km · horizon {rapport.reglages.horizon_jours} j ·
                      {' '}créés en « {rapport.reglages.statut_cible === 'publie' ? 'publié' : 'à valider'} »
                    </p>
                  )}

                  {(['retenue', 'irreguliere', 'sans_lieu', 'hors_zone'] as const).map(v => {
                    const items = (rapport.regles ?? []).filter(r => r.verdict === v)
                    if (items.length === 0) return null
                    const { label, color } = VERDICTS[v]
                    return (
                      <div key={v} className="space-y-1.5">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide pt-2">
                          {label} · {items.length}
                        </p>
                        {items.map(r => (
                          <div key={r.cle} className="bg-[#FBF7F0] rounded-xl px-3 py-2">
                            <div className="flex items-start gap-2">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${color}`}>
                                {r.jour === 'tous_les_jours' ? 'tous les jours' : r.jour}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[#2C1810] leading-snug">{r.titre}</p>
                                {r.description && (
                                  <p className="text-xs text-gray-500 leading-snug mt-0.5">{r.description}</p>
                                )}
                                <p className="text-[11px] text-gray-400 mt-1">
                                  {[
                                    r.heure,
                                    r.lieu_nom,
                                    r.periode_texte,
                                    r.distance_km != null ? `${r.distance_km} km` : null,
                                  ].filter(Boolean).join(' · ')}
                                </p>
                                {r.commentaire && (
                                  <p className="text-[11px] text-amber-700 mt-0.5">{r.commentaire}</p>
                                )}
                                {r.occurrences.length > 0 && (
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    {r.occurrences.length} date{r.occurrences.length > 1 ? 's' : ''}
                                    {' : '}{r.occurrences.slice(0, 3).join(', ')}
                                    {r.occurrences.length > 3 ? '…' : ''}
                                    {!rapport.dryRun && ` — ${r.inserees} créée${r.inserees > 1 ? 's' : ''}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </>
              ) : (
                /* ── Rapport source classique ── */
                <>
                  {(rapport.evenements ?? []).map((e, i) => {
                    const { label, color } = statutLabel(e.statut)
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${color}`}>{label}</span>
                        <span className="text-sm text-[#2C1810] leading-snug">{e.titre}</span>
                      </div>
                    )
                  })}
                  {(rapport.evenements ?? []).length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">Aucun événement inséré</p>
                  )}
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t border-[#E8E0D5]">
              <a href="/admin" className="block w-full text-center bg-[#C4622D] text-white text-sm font-bold py-2.5 rounded-xl">
                Voir dans l&apos;admin →
              </a>
            </div>
          </div>
        </div>
      )}

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
            placeholder="Nom (ex: Marchés des Cévennes)"
            className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C4622D]"
          />
          <input
            value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder="URL de la page"
            className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C4622D]"
          />

          {/* Type de source */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-semibold">Type de page</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C4622D]"
            >
              <option value="evenements">Événements datés (agenda, liste de sorties)</option>
              <option value="recurrent">Rendez-vous récurrents (marchés, permanences)</option>
            </select>
            <p className="text-[11px] text-gray-400 leading-snug">
              {estRecurrent
                ? 'La page décrit ce qui revient chaque semaine, sans dates. Les dates sont générées, et un re-scrape ne crée jamais de doublon.'
                : 'La page liste des événements avec leurs dates.'}
            </p>
          </div>

          {/*
              L'horizon et la publication directe valent pour LES DEUX types de
              source : le rayon et l'indice géographique, eux, ne servent qu'aux
              récurrentes. La case « publier directement » était enfermée avec
              elles, donc introuvable pour une source d'événements — alors qu'elle
              y change tout.
          */}
          <div className="bg-[#FBF7F0] rounded-xl p-3 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 font-semibold">Horizon (jours)</label>
                <input
                  type="number" inputMode="numeric"
                  value={form.horizon_jours}
                  onChange={e => setForm(f => ({ ...f, horizon_jours: e.target.value }))}
                  className="w-full bg-white border border-[#E8E0D5] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#C4622D]"
                />
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.publier_auto}
                onChange={e => setForm(f => ({ ...f, publier_auto: e.target.checked }))}
                className="mt-0.5"
              />
              <span className="text-xs text-gray-600 leading-snug">
                Publier directement ce qui est complet
                <span className="block text-[11px] text-gray-400">
                  Un événement qui a sa date, son lieu situé, sa description et son
                  image n&apos;a plus rien à vérifier. Ceux à qui il manque quelque
                  chose attendent quand même, en disant quoi.
                </span>
              </span>
            </label>
          </div>

          {estRecurrent && (
            <div className="bg-[#FBF7F0] rounded-xl p-3 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 font-semibold">Rayon (km)</label>
                  <input
                    type="number" inputMode="numeric"
                    value={form.rayon_km}
                    onChange={e => setForm(f => ({ ...f, rayon_km: e.target.value }))}
                    className="w-full bg-white border border-[#E8E0D5] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#C4622D]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold">Indice géographique</label>
                <input
                  value={form.indice_geo}
                  onChange={e => setForm(f => ({ ...f, indice_geo: e.target.value }))}
                  placeholder="Cévennes, France"
                  className="w-full bg-white border border-[#E8E0D5] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#C4622D]"
                />
                <p className="text-[11px] text-gray-400 leading-snug mt-1">
                  Ajouté aux recherches Google. Sans lui, « Bréau » (12 km) atterrit sur son
                  homonyme de Seine-et-Marne, à 518 km.
                </p>
              </div>
            </div>
          )}

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
              <option value="mensuel">Mensuel</option>
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
          const recurrent = src.type === 'recurrent'
          const sante = santeDeLaSource(src.scrape_logs)

          return (
            <div key={src.id} className="bg-white rounded-2xl p-4 shadow-sm border border-transparent">
              {/* Nom + toggle actif */}
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#2C1810] leading-tight truncate">{src.nom}</p>
                    {recurrent && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                        récurrent
                      </span>
                    )}
                    {sante && sante.etat !== 'vivante' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${COULEUR_SANTE[sante.etat]}`}>
                        {sante.etat === 'muette' ? 'ne rend plus rien' : 'en baisse'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{src.url}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Fréquence : {src.frequence}
                    {recurrent && ` · ${src.rayon_km ?? '?'} km · ${src.horizon_jours ?? 42} j${src.publier_auto ? ' · auto-publié' : ''}`}
                    {src.dernier_scrape && ` · Dernier scrape : ${new Date(src.dernier_scrape).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                  {sante && sante.etat !== 'vivante' && (
                    <p className="text-[11px] text-red-600 mt-1 leading-snug">
                      {sante.detail}
                      {sante.etat === 'muette'
                        ? ' — le site a peut-être déménagé sa page. Relancez : l’exploration cherchera toute seule.'
                        : ' — la page a peut-être changé de forme.'}
                    </p>
                  )}
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
                  (result?.erreur || result?.error || lastLog?.erreur) ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
                }`}>
                  {result ? (
                    result.erreur || result.error
                      ? `Erreur : ${result.erreur ?? result.error}`
                      : result.mode === 'recurrent' && result.totaux
                        ? `${result.totaux.regles_retenues} rendez-vous · ${result.dryRun ? `${result.totaux.occurrences_prevues} dates prévues (aperçu)` : `${result.totaux.occurrences_creees} dates créées`}`
                        : `${result.trouves} trouvés · ${result.doublons} doublons · ${result.inseres} insérés`
                  ) : lastLog ? (
                    lastLog.erreur
                      ? `Dernière erreur : ${lastLog.erreur}`
                      : `${lastLog.trouves} trouvés · ${lastLog.doublons} doublons · ${lastLog.inseres} insérés`
                  ) : null}
                </div>
              )}

              {/* Actions — l'aperçu n'existe que pour les sources récurrentes :
                  le pipeline classique écrit au fil de l'eau, il n'a pas de
                  mode « calcule mais n'écris rien ». */}
              <div className="flex gap-2">
                {recurrent && (
                  <button
                    onClick={() => lancer(src.id, src.nom, true)}
                    disabled={!!scraping}
                    className="flex-1 py-2 bg-[#FBF7F0] text-[#2C1810] text-xs font-bold rounded-xl disabled:opacity-50 border border-[#E8E0D5]"
                  >
                    {isScraping ? '...' : '👁 Aperçu'}
                  </button>
                )}
                <button
                  onClick={() => lancer(src.id, src.nom, false)}
                  disabled={!!scraping}
                  className="flex-1 py-2 bg-[#C4622D] text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isScraping ? (
                    <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scraping...</>
                  ) : '▶ Scraper'}
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
