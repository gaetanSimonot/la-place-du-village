import type { Metadata } from 'next'
import AppRedirect from './AppRedirect'

// Page d'aiguillage (derrière le QR code de com) : on ne veut pas qu'elle
// concurrence l'accueil dans l'index Google.
export const metadata: Metadata = {
  title: 'Installer La Place du Village',
  description: 'Installez l\'application La Place du Village sur votre téléphone.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://laplaceduvillage.app/' },
}

export default function Page() {
  return <AppRedirect />
}
