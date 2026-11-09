import type { Metadata } from 'next'
import MeteoVue from '@/components/meteo/MeteoVue'

export const metadata: Metadata = {
  title: 'Météo — La Place',
  description: 'La pluie et les nuages heure par heure, et le temps des prochains jours, près de chez vous.',
}

/** /meteo — carte de la pluie et des nuages (AROME, Météo-France). */
export default function MeteoPage() {
  return <MeteoVue />
}
