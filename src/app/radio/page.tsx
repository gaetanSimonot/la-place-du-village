import type { Metadata } from 'next'
import RadioClient from './client'

export const metadata: Metadata = {
  title: 'Radio Escapades — La Place',
  description: 'La sélection culturelle de la semaine par Radio Escapades, et où y aller.',
}

/**
 * /radio — l'expérience publique, sans compte.
 *
 * Comme /cinema : la page reste accessible, c'est le bloc sur la page Village
 * que le réglage `radio_village_public` ouvre ou ferme. Une adresse qui
 * apparaît et disparaît selon un réglage serait pire que le mal — la page dit
 * d'elle-même quand rien n'est encore monté.
 */
export default function RadioPage() {
  return <RadioClient />
}
