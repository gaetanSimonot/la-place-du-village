/**
 * Récupération du contenu "vivant" du site pour les blocs auto de la
 * newsletter. Côté serveur (supabaseAdmin). Utilisé par le rendu email ET par
 * l'aperçu admin (via /api/admin/newsletter/content).
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ContentItem } from '@/lib/newsletterBlocks'

const SITE = 'https://laplaceduvillage.app'

function todayISO(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return p
}
function dateFr(d: string | null): string | null {
  if (!d) return null
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00'))
  } catch { return d }
}
const clamp = (n: number) => Math.max(1, Math.min(8, Math.round(n || 3)))

export async function getEvents(count: number): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, image_url, date_debut, heure, lieux(nom, commune)')
    .eq('statut', 'publie')
    .gte('date_debut', todayISO())
    .order('date_debut', { ascending: true })
    .limit(clamp(count))
  return (data ?? []).map((e: Record<string, unknown>) => {
    const lieu = e.lieux as { nom?: string; commune?: string } | null
    return {
      title: (e.titre as string) ?? 'Événement',
      sub: [dateFr(e.date_debut as string | null), lieu?.nom || lieu?.commune].filter(Boolean).join(' · ') || null,
      image: (e.image_url as string | null) ?? null,
      href: `${SITE}/evenement/${e.id}`,
    }
  })
}

export async function getPromos(count: number): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin
    .from('promotions')
    .select('id, title, image_url, etablissement_id')
    .eq('active', true)
    .or('valid_until.is.null,valid_until.gte.' + new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(clamp(count))
  const rows = data ?? []
  const etabIds = Array.from(new Set(rows.map(r => r.etablissement_id).filter(Boolean)))
  const { data: etabs } = etabIds.length
    ? await supabaseAdmin.from('etablissements').select('id, nom, photos').in('id', etabIds)
    : { data: [] }
  const etabMap = Object.fromEntries((etabs ?? []).map(e => [e.id, e]))
  return rows.map((p: Record<string, unknown>) => {
    const etab = etabMap[p.etablissement_id as string] as { nom?: string; photos?: string[] } | undefined
    return {
      title: (p.title as string) ?? 'Promotion',
      sub: etab?.nom ?? null,
      image: (p.image_url as string | null) || (etab?.photos?.[0] ?? null),
      href: `${SITE}/promotions?id=${p.id}`,
    }
  })
}

export async function getAnnonces(count: number): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin
    .from('annonces')
    .select('id, titre, photos, ville, prix_actuel')
    .in('statut', ['active', 'don_final'])
    .order('created_at', { ascending: false })
    .limit(clamp(count))
  return (data ?? []).map((a: Record<string, unknown>) => ({
    title: (a.titre as string) ?? 'Annonce',
    sub: [a.prix_actuel != null ? `${a.prix_actuel} €` : null, a.ville].filter(Boolean).join(' · ') || null,
    image: (a.photos as string[] | null)?.[0] ?? null,
    href: `${SITE}/annonces/${a.id}`,
  }))
}

export async function getJournal(): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero, cover_titre, cover_image_url')
    .eq('statut', 'publie')
    .order('numero', { ascending: false })
    .limit(1)
  const j = data?.[0]
  if (!j) return []
  return [{
    title: (j.cover_titre as string) || `Journal du Village n°${j.numero}`,
    sub: `Numéro ${j.numero}`,
    image: (j.cover_image_url as string | null) ?? null,
    href: `${SITE}/journal/${j.numero}`,
  }]
}

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

/** Dispatch utilisé par l'aperçu admin. */
export async function getContent(kind: string, count: number, ids: string[]): Promise<ContentItem[]> {
  switch (kind) {
    case 'events':      return getEvents(count)
    case 'promos':      return getPromos(count)
    case 'annonces':    return getAnnonces(count)
    case 'journal':     return getJournal()
    case 'partenaires': return getPartenaires(ids)
    default:            return []
  }
}
