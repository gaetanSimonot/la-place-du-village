'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
  mode?: 'recurrent'
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
}

const VERDICTS: Record<RegleRapport['verdict'], { label: string; color: string }> = {
  retenue:     { label: 'Retenu',      color: 'bg-green-100 text-green-700' },
  hors_zone:   { label: 'Hors zone',   color: 'bg-gray-100 text-gray-500' },
  sans_lieu:   { label: 'Lieu inconnu', color: 'bg-orange-100 text-orange-700' },
  irreguliere: { label: 'À la main',   color: 'bg-amber-100 text-amber-700' },
}

export default function SourcesPage() {
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
    const res = await fetch('/api/admin/sources', { headers: await adminHeaders() })
    const data = await res.json()
    setSources(data.sources ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  const addSource = async () => {
    if (!form.nom.trim() || !form.url.trim()) return
    setAdding(true)
    const payload = form.type === 'recurrent'
      ? form
      : { nom: form.nom, url: form.url, frequence: form.frequence, type: 'evenements' }
    await fetch('/api/admin/sources', {
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

  const lancer = async (id: string, nom: string, dryRun: boolean) => {
    if (!dryRun && !confirm(`Scraper « ${nom} » et écrire en base ?`)) return
    setScraping(id)
    setScrapeResult(r => ({ ...r, [id]: undefined as unknown as ScrapeResult }))
    const res = await fetch(`/api/scrape-source?id=${id}${dryRun ? '&dryRun=1' : ''}`, {
      headers: await adminHeaders(),
    })
    const data = await res.json()
    setScrapeResult(r => ({ ...r, [id]: data }))
    if (!data.erreur && !data.error) setRapport({ ...data, sourceName: nom })
    if (!dryRun) await fetchSources()
    setScraping(null)
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
                    : `${rapport.trouves} trouvés · ${rapport.doublons} doublons · ${rapport.inseres} insérés`}
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
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.publier_auto}
                  onChange={e => setForm(f => ({ ...f, publier_auto: e.target.checked }))}
                  className="mt-0.5"
                />
                <span className="text-xs text-gray-600 leading-snug">
                  Publier directement
                  <span className="block text-[11px] text-gray-400">
                    Sinon chaque date part dans la file à valider — 25 marchés sur 6 semaines,
                    ça fait 150 lignes à cliquer. La validation se fait une fois, sur l&apos;aperçu.
                  </span>
                </span>
              </label>
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
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{src.url}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Fréquence : {src.frequence}
                    {recurrent && ` · ${src.rayon_km ?? '?'} km · ${src.horizon_jours ?? 42} j${src.publier_auto ? ' · auto-publié' : ''}`}
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

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => lancer(src.id, src.nom, true)}
                  disabled={!!scraping}
                  className="flex-1 py-2 bg-[#FBF7F0] text-[#2C1810] text-xs font-bold rounded-xl disabled:opacity-50 border border-[#E8E0D5]"
                >
                  {isScraping ? '...' : '👁 Aperçu'}
                </button>
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
