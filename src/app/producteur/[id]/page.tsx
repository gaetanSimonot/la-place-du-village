import { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import ProducteurPageClient from './client'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseAdmin.from('producers').select('nom, description_courte, photos, commune').eq('id', id).single()
  if (!data) return { title: 'Producteur — La Place du Village' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://la-place-du-village.vercel.app'
  const imageUrl = (data.photos ?? [])[0] ?? `${appUrl}/logo.png`
  const commune = data.commune ? ` · ${data.commune}` : ''

  return {
    title: `🌿 ${data.nom}${commune} — La Place du Village`,
    description: data.description_courte ?? undefined,
    openGraph: {
      title: `🌿 ${data.nom}`,
      description: data.description_courte ?? undefined,
      url: `${appUrl}/producteur/${id}`,
      siteName: 'La Place du Village',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: data.nom }],
      type: 'article',
    },
  }
}

export default async function ProducteurPage({ params }: Props) {
  const { id } = await params
  return <ProducteurPageClient id={id} />
}
