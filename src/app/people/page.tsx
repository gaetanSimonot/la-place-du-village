import type { Metadata } from 'next'
import PeopleClient from './client'

export const metadata: Metadata = {
  title: 'Les gens — La Place du Village',
}

export default function PeoplePage() {
  return <PeopleClient />
}
