import { Metadata } from 'next'
import AnnoncesPageClient from './client'

export const metadata: Metadata = {
  title: 'Petites annonces — La Place du Village',
  description: 'Ventes, dons, trocs et enchères inversées autour de Ganges.',
  openGraph: {
    title: 'Annonces — La Place du Village',
    description: 'Tout ce dont tu as besoin, près de chez toi. Dépose, cherche, trouve.',
    url: 'https://laplaceduvillage.app/annonces',
    siteName: 'La Place du Village',
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: '/og/annonces.jpg',
        width: 1200,
        height: 800,
        alt: 'Annonces — Tout ce dont tu as besoin, près de chez toi',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Annonces — La Place du Village',
    description: 'Tout ce dont tu as besoin, près de chez toi.',
    images: ['/og/annonces.jpg'],
  },
}

export default function AnnoncesPage() {
  return <AnnoncesPageClient />
}
