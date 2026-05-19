import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import JournalPageClient, { type JournalRow, type ArchiveEntry } from './client'

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

  // Archives — 6 numéros précédents
  const { data: archivesData } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero, cover_titre, date_parution')
    .eq('statut', 'publie')
    .lt('numero', row.numero)
    .order('numero', { ascending: false })
    .limit(6)
  const archives: ArchiveEntry[] = (archivesData ?? []) as ArchiveEntry[]

  return <JournalPageClient row={row} archives={archives} />
}
