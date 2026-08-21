import type { Metadata } from 'next'
import CinemaClient from './client'

export const metadata: Metadata = {
  title: 'Au cinéma — La Place du Village',
  description: 'Les films à l’affiche et les séances près de chez vous.',
}

/**
 * /cinema — l'expérience publique, sans compte.
 *
 * `?cinema=<slug>` ouvre directement une salle : c'est ce que porteront les
 * QR codes affichés dans les cinémas.
 */
export default function CinemaPage() {
  return <CinemaClient />
}
