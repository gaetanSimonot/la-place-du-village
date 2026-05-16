import { Metadata } from 'next'
import SupportConversationClient from './client'

export const metadata: Metadata = {
  title: 'Support — La Place du Village',
}

export default async function SupportConversationPage({ params }: { params: Promise<{ convId: string }> }) {
  const { convId } = await params
  return <SupportConversationClient convId={convId} mode="user" />
}
