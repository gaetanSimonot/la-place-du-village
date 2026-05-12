import { Metadata } from 'next'
import AnnoncesPageClient from './client'

export const metadata: Metadata = {
  title: 'Petites annonces — La Place du Village',
  description: 'Ventes, dons, trocs et enchères inversées autour de Ganges.',
}

export default function AnnoncesPage() {
  return <AnnoncesPageClient />
}
