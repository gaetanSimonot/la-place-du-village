import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import TopicClient from './client'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseAdmin.from('forum_topics').select('titre').eq('id', id).maybeSingle()
  return { title: data?.titre ? `${data.titre} — La Place Publique` : 'La Place Publique' }
}

export default async function TopicPage({ params }: Props) {
  const { id } = await params
  return <TopicClient id={id} />
}
