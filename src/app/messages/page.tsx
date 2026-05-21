import type { Metadata } from 'next'
import MessagesClient from './client'

export const metadata: Metadata = {
  title: 'Messages — La Place du Village',
}

export default function MessagesPage() {
  return <MessagesClient />
}
