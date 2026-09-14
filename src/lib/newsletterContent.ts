/**
 * Récupération du contenu "vivant" du site pour les blocs auto de la
 * newsletter. Côté serveur (supabaseAdmin). Utilisé par le rendu email ET par
 * l'aperçu/pickers admin (via /api/admin/newsletter/content).
 *
 * Chaque getter accepte (count, ids) : si ids fournis → contenu CHOISI (ordre
 * conservé), sinon → top `count` automatique.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ContentItem, SemaineChiffres } from '@/lib/newsletterBlocks'
import { semaineDe } from '@/lib/semaine'
import { CATEGORIES } from '@/lib/categories'

const SITE = 'https://laplaceduvillage.app'

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function dateFr(d: string | null): string | null {
  if (!d) return null
  try { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00')) } catch { return d }
}
/**
 * Plafond d'une section automatique.
 *
 * 30 et non 12 : « on met tous les bons plans » est une consigne explicite, et
 * il y en a une dizaine en ce moment. Le plafond reste là pour qu'une donnée
 * aberrante ne produise pas un email de 400 lignes.
 */
const clamp = (n: number) => Math.max(1, Math.min(30, Math.round(n || 4)))
function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const map = Object.fromEntries(rows.map(r => [r.id, r]))
  return ids.map(i => map[i]).filter(Boolean)
}

// ── La semaine en chiffres ──────────────────────────────────────────────────

/**
 * Combien d'événements cette semaine, et de quelle sorte.
 *
 * Ce qu'on ÉCARTE, et pourquoi : les expositions et festivals qui durent une
 * semaine ou plus. Ils sont vrais, mais ils sont là toutes les semaines — les
 * compter gonflerait le chiffre sans rien dire de neuf, et le même « 30 » tous
 * les lundis ne veut plus rien dire.
 *
 * Ce qu'on GARDE, et c'est délibéré : les rendez-vous récurrents, marchés en
 * tête. Un marché le samedi est exactement ce qu'on veut annoncer un lundi.
 * Les exclure faisait tomber le compte de 66 à 52 et la vallée paraissait plus
 * endormie qu'elle ne l'est.
 */
const DUREE_EXPO_JOURS = 7

export async function getSemaineChiffres(): Promise<SemaineChiffres> {
  const sem = semaineDe()
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('date_debut, date_fin, categorie')
    .eq('statut', 'publie')
    .lte('date_debut', sem.fin)
    .limit(3000)

  const jours = (a: string, b: string | null) =>
    Math.round((new Date((b ?? a) + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

  const pendantLaSemaine = (data ?? []).filter(e => {
    const debut = e.date_debut as string
    const fin   = (e.date_fin as string | null) ?? debut
    return fin >= sem.debut                                 // pas déjà passé
  })

  const retenus = pendantLaSemaine.filter(e =>
    jours(e.date_debut as string, (e.date_fin as string | null)) < DUREE_EXPO_JOURS)

  /*
   * Les écartés, comptés au lieu d'être tus.
   *
   * Ils sont la DIFFÉRENCE entre la carte et cette lettre : au 14/09/2026, la
   * carte affichait 144 rendez-vous pour la semaine et le compteur 108 — les
   * 36 manquants étaient tous des saisons de yoga, des ateliers vélo et des
   * expositions. Les deux chiffres étaient justes, mais l'écart n'était
   * explicable nulle part. Une ligne suffit à le dire.
   */
  const installes = pendantLaSemaine.length - retenus.length

  const compte: Record<string, number> = {}
  for (const e of retenus) {
    const c = (e.categorie as string) || 'autre'
    compte[c] = (compte[c] ?? 0) + 1
  }

  const categories = Object.entries(compte)
    .map(([id, n]) => {
      const c = CATEGORIES[id as keyof typeof CATEGORIES] ?? CATEGORIES.autre
      return { id, label: c.label, emoji: c.emoji, couleur: c.color, n }
    })
    .sort((a, b) => b.n - a.n)

  return {
    total: retenus.length,
    libelle: sem.libelle,
    categories,
    href: `${SITE}/?mode=agenda&quand=cette_semaine`,
    installes,
  }
}

// ── Événements ──────────────────────────────────────────────────────────────
export async function getEvents(count: number, ids: string[] = []): Promise<ContentItem[]> {
  const sel = 'id, titre, image_url, date_debut, lieux(nom, commune)'
  let rows: Record<string, unknown>[]
  if (ids.length) {
    const { data } = await supabaseAdmin.from('evenements').select(sel).in('id', ids)
    rows = orderByIds((data ?? []) as { id: string }[], ids) as Record<string, unknown>[]
  } else {
    const { data } = await supabaseAdmin.from('evenements').select(sel).eq('statut', 'publie').gte('date_debut', todayISO()).order('date_debut', { ascending: true }).limit(clamp(count))
    rows = (data ?? []) as Record<string, unknown>[]
  }
  return rows.map(e => {
    const lieu = e.lieux as { nom?: string; commune?: string } | null
    return { title: (e.titre as string) ?? 'Événement', sub: [dateFr(e.date_debut as string | null), lieu?.nom || lieu?.commune].filter(Boolean).join(' · ') || null, image: (e.image_url as string | null) ?? null, href: `${SITE}/evenement/${e.id}` }
  })
}

// ── Promos ──────────────────────────────────────────────────────────────────
export async function getPromos(count: number, ids: string[] = []): Promise<ContentItem[]> {
  let rows: Record<string, unknown>[]
  if (ids.length) {
    const { data } = await supabaseAdmin.from('promotions').select('id, title, image_url, etablissement_id').in('id', ids)
    rows = orderByIds((data ?? []) as { id: string }[], ids) as Record<string, unknown>[]
  } else {
    const { data } = await supabaseAdmin.from('promotions').select('id, title, image_url, etablissement_id').eq('active', true).or('valid_until.is.null,valid_until.gte.' + new Date().toISOString()).order('created_at', { ascending: false }).limit(clamp(count))
    rows = (data ?? []) as Record<string, unknown>[]
  }
  const etabIds = Array.from(new Set(rows.map(r => r.etablissement_id).filter(Boolean) as string[]))
  const { data: etabs } = etabIds.length ? await supabaseAdmin.from('etablissements').select('id, nom, photos').in('id', etabIds) : { data: [] }
  const etabMap = Object.fromEntries((etabs ?? []).map(e => [e.id, e]))
  return rows.map(p => {
    const etab = etabMap[p.etablissement_id as string] as { nom?: string; photos?: string[] } | undefined
    return { title: (p.title as string) ?? 'Promotion', sub: etab?.nom ?? null, image: (p.image_url as string | null) || (etab?.photos?.[0] ?? null), href: `${SITE}/promotions?id=${p.id}` }
  })
}

// ── Annonces ────────────────────────────────────────────────────────────────
export async function getAnnonces(count: number, ids: string[] = []): Promise<ContentItem[]> {
  const sel = 'id, titre, photos, ville, prix_actuel'
  let rows: Record<string, unknown>[]
  if (ids.length) {
    const { data } = await supabaseAdmin.from('annonces').select(sel).in('id', ids)
    rows = orderByIds((data ?? []) as { id: string }[], ids) as Record<string, unknown>[]
  } else {
    const { data } = await supabaseAdmin.from('annonces').select(sel).in('statut', ['active', 'don_final']).order('created_at', { ascending: false }).limit(clamp(count))
    rows = (data ?? []) as Record<string, unknown>[]
  }
  return rows.map(a => ({ title: (a.titre as string) ?? 'Annonce', sub: [a.prix_actuel != null ? `${a.prix_actuel} €` : null, a.ville].filter(Boolean).join(' · ') || null, image: (a.photos as string[] | null)?.[0] ?? null, href: `${SITE}/annonces/${a.id}` }))
}

// ── Journal ─────────────────────────────────────────────────────────────────
export async function getJournal(): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin.from('journaux_hebdo').select('numero, cover_titre, cover_image_url').eq('statut', 'publie').order('numero', { ascending: false }).limit(1)
  const j = data?.[0]
  if (!j) return []
  return [{ title: (j.cover_titre as string) || `Journal du Village n°${j.numero}`, sub: `Numéro ${j.numero}`, image: (j.cover_image_url as string | null) ?? null, href: `${SITE}/journal/${j.numero}` }]
}

// ── Articles du Journal ─────────────────────────────────────────────────────
function excerpt(t: string | null, n = 120): string | null {
  if (!t) return null
  const s = String(t).replace(/<[^>]+>/g, ' ').replace(/[#*_>`]/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? (s.length > n ? s.slice(0, n).trimEnd() + '…' : s) : null
}
export async function getArticles(ids: string[]): Promise<ContentItem[]> {
  if (!ids.length) return []
  const { data } = await supabaseAdmin.from('articles_journal').select('id, titre, corps, photo_url').in('id', ids)
  const rows = orderByIds((data ?? []) as { id: string }[], ids) as Record<string, unknown>[]
  return rows.map(a => ({ title: (a.titre as string) ?? 'Article', sub: excerpt(a.corps as string | null), image: (a.photo_url as string | null) ?? null, href: `${SITE}/journal/articles/${a.id}/view` }))
}

// ── Partenaires ─────────────────────────────────────────────────────────────
export async function getPartenaires(ids: string[]): Promise<ContentItem[]> {
  const etabIds = ids.filter(i => i.startsWith('etab:')).map(i => i.slice(5))
  const prodIds = ids.filter(i => i.startsWith('prod:')).map(i => i.slice(5))
  const [etabs, prods] = await Promise.all([
    etabIds.length ? supabaseAdmin.from('etablissements').select('id, nom, photos, commune').in('id', etabIds) : Promise.resolve({ data: [] }),
    prodIds.length ? supabaseAdmin.from('producers').select('id, nom, photos, commune').in('id', prodIds) : Promise.resolve({ data: [] }),
  ])
  const map: Record<string, ContentItem> = {}
  ;(etabs.data ?? []).forEach((e: Record<string, unknown>) => { map[`etab:${e.id}`] = { title: e.nom as string, sub: (e.commune as string) ?? null, image: (e.photos as string[] | null)?.[0] ?? null, href: `${SITE}/etablissement/${e.id}` } })
  ;(prods.data ?? []).forEach((p: Record<string, unknown>) => { map[`prod:${p.id}`] = { title: p.nom as string, sub: (p.commune as string) ?? null, image: (p.photos as string[] | null)?.[0] ?? null, href: `${SITE}/producteur/${p.id}` } })
  return ids.map(i => map[i]).filter(Boolean) as ContentItem[]
}

export async function getContent(kind: string, count: number, ids: string[]): Promise<ContentItem[]> {
  switch (kind) {
    case 'events':      return getEvents(count, ids)
    case 'promos':      return getPromos(count, ids)
    case 'annonces':    return getAnnonces(count, ids)
    case 'journal':     return getJournal()
    case 'article':     return getArticles(ids)
    case 'partenaires': return getPartenaires(ids)
    default:            return []
  }
}

// ── Recherche (pickers manuels) ─────────────────────────────────────────────
export interface SearchResult { value: string; label: string; sub: string | null; image: string | null }

/** Liste des candidats d'une section (pour le modal « choisir »). */
export async function browseList(kind: string): Promise<SearchResult[]> {
  if (kind === 'events') {
    const { data } = await supabaseAdmin.from('evenements').select('id, titre, image_url, date_debut').eq('statut', 'publie').gte('date_debut', todayISO()).order('date_debut', { ascending: true }).limit(50)
    return (data ?? []).map(e => ({ value: e.id as string, label: e.titre as string, sub: dateFr(e.date_debut as string | null), image: (e.image_url as string | null) ?? null }))
  }
  if (kind === 'promos') {
    const { data } = await supabaseAdmin.from('promotions').select('id, title, image_url').eq('active', true).or('valid_until.is.null,valid_until.gte.' + new Date().toISOString()).order('created_at', { ascending: false }).limit(50)
    return (data ?? []).map(p => ({ value: p.id as string, label: p.title as string, sub: null, image: (p.image_url as string | null) ?? null }))
  }
  if (kind === 'annonces') {
    const { data } = await supabaseAdmin.from('annonces').select('id, titre, photos, ville').in('statut', ['active', 'don_final']).order('created_at', { ascending: false }).limit(50)
    return (data ?? []).map(a => ({ value: a.id as string, label: a.titre as string, sub: (a.ville as string) ?? null, image: (a.photos as string[] | null)?.[0] ?? null }))
  }
  if (kind === 'article') {
    const { data } = await supabaseAdmin.from('articles_journal').select('id, titre, photo_url').eq('statut', 'publie').order('created_at', { ascending: false }).limit(50)
    return (data ?? []).map(a => ({ value: a.id as string, label: a.titre as string, sub: null, image: (a.photo_url as string | null) ?? null }))
  }
  if (kind === 'partenaires') {
    const [etabs, prods] = await Promise.all([
      supabaseAdmin.from('etablissements').select('id, nom, photos, commune').order('nom', { ascending: true }).limit(30),
      supabaseAdmin.from('producers').select('id, nom, photos, commune').order('nom', { ascending: true }).limit(30),
    ])
    return [
      ...(etabs.data ?? []).map(e => ({ value: `etab:${e.id}`, label: e.nom as string, sub: (e.commune as string) ?? null, image: (e.photos as string[] | null)?.[0] ?? null })),
      ...(prods.data ?? []).map(p => ({ value: `prod:${p.id}`, label: p.nom as string, sub: (p.commune as string) ?? null, image: (p.photos as string[] | null)?.[0] ?? null })),
    ]
  }
  return []
}

export async function search(kind: string, q: string): Promise<SearchResult[]> {
  const like = `%${q}%`
  if (kind === 'events') {
    const { data } = await supabaseAdmin.from('evenements').select('id, titre, image_url, date_debut').eq('statut', 'publie').ilike('titre', like).order('date_debut', { ascending: false }).limit(10)
    return (data ?? []).map(e => ({ value: e.id as string, label: e.titre as string, sub: dateFr(e.date_debut as string | null), image: (e.image_url as string | null) ?? null }))
  }
  if (kind === 'promos') {
    const { data } = await supabaseAdmin.from('promotions').select('id, title, image_url').eq('active', true).ilike('title', like).limit(10)
    return (data ?? []).map(p => ({ value: p.id as string, label: p.title as string, sub: null, image: (p.image_url as string | null) ?? null }))
  }
  if (kind === 'annonces') {
    const { data } = await supabaseAdmin.from('annonces').select('id, titre, photos, ville').in('statut', ['active', 'don_final']).ilike('titre', like).limit(10)
    return (data ?? []).map(a => ({ value: a.id as string, label: a.titre as string, sub: (a.ville as string) ?? null, image: (a.photos as string[] | null)?.[0] ?? null }))
  }
  if (kind === 'article') {
    const { data } = await supabaseAdmin.from('articles_journal').select('id, titre, photo_url').eq('statut', 'publie').ilike('titre', like).limit(10)
    return (data ?? []).map(a => ({ value: a.id as string, label: a.titre as string, sub: null, image: (a.photo_url as string | null) ?? null }))
  }
  if (kind === 'partenaires') {
    const [etabs, prods] = await Promise.all([
      supabaseAdmin.from('etablissements').select('id, nom, photos, commune').ilike('nom', like).limit(8),
      supabaseAdmin.from('producers').select('id, nom, photos, commune').ilike('nom', like).limit(8),
    ])
    return [
      ...(etabs.data ?? []).map(e => ({ value: `etab:${e.id}`, label: e.nom as string, sub: (e.commune as string) ?? null, image: (e.photos as string[] | null)?.[0] ?? null })),
      ...(prods.data ?? []).map(p => ({ value: `prod:${p.id}`, label: p.nom as string, sub: (p.commune as string) ?? null, image: (p.photos as string[] | null)?.[0] ?? null })),
    ]
  }
  return []
}
