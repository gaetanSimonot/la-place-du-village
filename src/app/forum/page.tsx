import type { Metadata } from 'next'
import ForumClient from './client'

export const metadata: Metadata = {
  title: 'La Place Publique — La Place du Village',
  description: 'Les discussions du village : lancez un sujet, débattez, sondez.',
}

export default function ForumPage() {
  return <ForumClient />
}
