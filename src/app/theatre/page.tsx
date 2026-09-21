import type { Metadata } from 'next'
import TheatreClient from './client'

export const metadata: Metadata = {
  title: 'Au théâtre — La Place',
  description: 'La saison, les spectacles et les représentations près de chez vous.',
}

/**
 * /theatre — l'expérience publique, sans compte.
 *
 * `?theatre=<slug>` ouvre directement une salle : c'est ce que porteront les
 * QR codes affichés dans les théâtres.
 *
 * La page reste accessible même quand le bloc du Village est masqué : une
 * adresse qui apparaît et disparaît selon un réglage est pire que le mal.
 * C'est la page elle-même qui dit quand elle est vide.
 */
export default function TheatrePage() {
  return <TheatreClient />
}
