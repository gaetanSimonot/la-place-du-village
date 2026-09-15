import { Metadata } from 'next'
import MesConversationsClient from './client'

export const metadata: Metadata = {
  title: 'Mes conversations — La Place',
}

export default function MesConversationsPage() {
  return <MesConversationsClient />
}
