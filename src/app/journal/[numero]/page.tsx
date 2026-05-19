import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import JournalPageClient, {
  type JournalRow, type ArchiveEntry,
  type EventEntry, type AnnonceEntry, type PromoEntry, type SpotlightEntry, type ArticleEntry,
} from './client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ numero: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { numero } = await params
  const n = parseInt(numero, 10)
  if (!Number.isFinite(n)) return { title: 'Journal — La Place du Village' }

  const { data } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('cover_titre, cover_deck, cover_image_url, date_parution')
    .eq('numero', n)
    .eq('statut', 'publie')
    .maybeSingle()

  if (!data) return { title: `Journal n°${n} — La Place du Village` }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laplaceduvillage.app'
  const imageUrl = data.cover_image_url ?? `${appUrl}/logo.png`

  return {
    title: `n°${n} · ${data.cover_titre} — Journal du Village`,
    description: data.cover_deck,
    openGraph: {
      title: `Journal du Village n°${n} — ${data.cover_titre}`,
      description: data.cover_deck,
      url: `${appUrl}/journal/${n}`,
      siteName: 'La Place du Village',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: data.cover_titre }],
      type: 'article',
    },
  }
}

export default async function JournalNumeroPage({ params }: Props) {
  const { numero } = await params
  const n = parseInt(numero, 10)
  if (!Number.isFinite(n)) notFound()

  const { data: journal } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('*')
    .eq('numero', n)
    .eq('statut', 'publie')
    .maybeSingle()

  if (!journal) notFound()

  const row = journal as JournalRow

  // Charge les entités liées en parallèle
  const evIds  = (row.selection_event_ids ?? []) as string[]
  const annIds = (row.selection_annonce_ids ?? []) as string[]
  const proIds = (row.selection_bonplan_ids ?? []) as string[]

  const [eventsRes, annoncesRes, promosRes, articleRes, spotlightRes, archivesRes] = await Promise.all([
    evIds.length > 0
      ? supabaseAdmin.from('evenements').select('id, titre, image_url, date_debut, heure, categorie, lieux(nom, commune)').in('id', evIds)
      : Promise.resolve({ data: [] }),
    annIds.length > 0
      ? supabaseAdmin.from('annonces').select('id, titre, description, photos, type, prix_initial, prix_actuel, ville').in('id', annIds)
      : Promise.resolve({ data: [] }),
    proIds.length > 0
      ? supabaseAdmin.from('promotions').select('id, title, description, image_url, etablissement_id, etablissements(nom, commune)').in('id', proIds)
      : Promise.resolve({ data: [] }),
    row.selection_article_id
      ? supabaseAdmin.from('articles_journal').select('id, titre, corps, photo_url, user_id').eq('id', row.selection_article_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.spotlight_etab_id
      ? supabaseAdmin.from('etablissements').select('id, nom, commune, type, photos, description_courte').eq('id', row.spotlight_etab_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from('journaux_hebdo')
      .select('numero, cover_titre, date_parution')
      .eq('statut', 'publie')
      .lt('numero', row.numero)
      .order('numero', { ascending: false })
      .limit(6),
  ])

  // Préserve l'ordre demandé par l'admin (selection_*_ids)
  const orderById = <T extends { id: string }>(rows: T[], ids: string[]): T[] => {
    const map = Object.fromEntries(rows.map(r => [r.id, r]))
    return ids.map(id => map[id]).filter(Boolean)
  }

  const events    = orderById(((eventsRes.data ?? []) as unknown as EventEntry[]), evIds)
  const annonces  = orderById(((annoncesRes.data ?? []) as AnnonceEntry[]), annIds)
  const promos    = orderById(((promosRes.data ?? []) as unknown as PromoEntry[]), proIds)
  const article   = (articleRes.data as ArticleEntry | null) ?? null
  const spotlight = (spotlightRes.data as SpotlightEntry | null) ?? null
  const archives: ArchiveEntry[] = (archivesRes.data ?? []) as ArchiveEntry[]

  return (
    <JournalPageClient
      row={row}
      archives={archives}
      events={events}
      annonces={annonces}
      promos={promos}
      article={article}
      spotlight={spotlight}
    />
  )
}
