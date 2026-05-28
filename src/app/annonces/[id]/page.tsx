import { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ogTransform } from '@/lib/og-image'
import AnnoncePageClient from './client'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseAdmin
    .from('annonces')
    .select('titre, description, photos, ville')
    .eq('id', id)
    .maybeSingle()

  if (!data) return { title: 'Annonce — La Place du Village' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laplaceduvillage.app'
  const rawPhoto = (data.photos ?? [])[0]
  // Supabase Image Transformations → version 1200x630 compressée à la volée.
  // Sans ça, WhatsApp/Messenger ne chargent pas l'image source 2-5 MB.
  const imageUrl = rawPhoto ? ogTransform(rawPhoto) : `${appUrl}/og/home.jpg`
  const ville = data.ville ? ` · ${data.ville}` : ''

  return {
    title: `${data.titre}${ville} — La Place du Village`,
    description: data.description ?? undefined,
    openGraph: {
      title: data.titre,
      description: data.description ?? undefined,
      url: `${appUrl}/annonces/${id}`,
      siteName: 'La Place du Village',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: data.titre }],
      type: 'article',
    },
  }
}

export default async function AnnoncePage({ params }: Props) {
  const { id } = await params
  return <AnnoncePageClient id={id} />
}
