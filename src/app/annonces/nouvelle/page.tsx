import { Metadata } from 'next'
import NouvelleAnnonceClient from './client'

export const metadata: Metadata = {
  title: 'Publier une annonce — La Place du Village',
}

export default function NouvelleAnnoncePage() {
  return <NouvelleAnnonceClient />
}
