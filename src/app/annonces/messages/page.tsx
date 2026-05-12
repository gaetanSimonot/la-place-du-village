import { Metadata } from 'next'
import MesConversationsClient from './client'

export const metadata: Metadata = {
  title: 'Mes conversations — La Place du Village',
}

export default function MesConversationsPage() {
  return <MesConversationsClient />
}
