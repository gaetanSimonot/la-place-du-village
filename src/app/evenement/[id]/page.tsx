import { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CATEGORIES } from '@/lib/categories'
import { Categorie } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import EvenementPageClient from './client'

type Props = { params: Promise<{ id: string }> }

type EventMeta = {
  titre: string
  description: string | null
  image_url: string | null
  date_debut: string | null
  categorie: string
  lieux: { commune: string | null } | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('titre, description, image_url, date_debut, categorie, lieux(commune)')
    .eq('id', id)
    .single()

  if (!data) return { title: 'Événement — La Place du Village' }

  const evt = data as unknown as EventMeta
  const cat = CATEGORIES[evt.categorie as Categorie] ?? CATEGORIES.autre
  const dateStr = evt.date_debut ? formatDate(evt.date_debut) : ''
  const commune = evt.lieux?.commune ? ` · ${evt.lieux.commune}` : ''
  const description = [dateStr + commune, evt.description?.slice(0, 160)]
    .filter(Boolean).join(' — ')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://la-place-du-village.vercel.app'
  const imageUrl = evt.image_url ?? `${appUrl}/logo.png`

  return {
    title: `${cat.emoji} ${evt.titre} — La Place du Village`,
    description,
    openGraph: {
      title: `${cat.emoji} ${evt.titre}`,
      description,
      url: `${appUrl}/evenement/${id}`,
      siteName: 'La Place du Village',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: evt.titre }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${cat.emoji} ${evt.titre}`,
      description,
      images: [imageUrl],
    },
  }
}

export default async function EvenementPage({ params }: Props) {
  const { id } = await params
  return <EvenementPageClient id={id} />
}
