import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import TopicClient from './client'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseAdmin
    .from('forum_topics')
    .select('titre, corps, media')
    .eq('id', id)
    .maybeSingle()

  if (!data?.titre) return { title: 'La Place Publique' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laplaceduvillage.app'
  // 1ère photo du sujet (media jsonb : { t: 'photo', url }) → vignette de partage,
  // sinon fallback logo.
  const media = (data.media ?? []) as Array<{ t?: string; url?: string }>
  const photo = media.find(m => m.t === 'photo' && m.url)?.url
  const imageUrl = photo ?? `${appUrl}/logo.png`
  const description = data.corps ? data.corps.slice(0, 200) : 'Une discussion sur La Place du Village.'

  return {
    title: `${data.titre} — La Place Publique`,
    description,
    openGraph: {
      title: data.titre,
      description,
      url: `${appUrl}/forum/${id}`,
      siteName: 'La Place du Village',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: data.titre }],
      type: 'article',
    },
  }
}

export default async function TopicPage({ params }: Props) {
  const { id } = await params
  return <TopicClient id={id} />
}
