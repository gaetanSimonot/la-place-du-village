import { Metadata } from 'next'
import ConversationPageClient from './client'

export const metadata: Metadata = {
  title: 'Conversation — La Place du Village',
}

export default async function ConversationPage({ params }: { params: Promise<{ convId: string }> }) {
  const { convId } = await params
  return <ConversationPageClient convId={convId} />
}
