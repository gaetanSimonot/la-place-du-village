import { Metadata } from 'next'
import SupportConversationClient from '@/app/support/[convId]/client'

export const metadata: Metadata = {
  title: 'Ticket support — Admin',
}

export default async function AdminSupportConversationPage({ params }: { params: Promise<{ convId: string }> }) {
  const { convId } = await params
  return <SupportConversationClient convId={convId} mode="admin" />
}
