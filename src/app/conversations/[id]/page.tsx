import type { Metadata } from 'next'
import ConversationClient from './client'

export const metadata: Metadata = {
  title: 'Conversation — La Place du Village',
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ConversationClient convId={id} />
}
