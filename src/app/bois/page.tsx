import type { Metadata } from 'next'
import BoisClient from './client'

export const metadata: Metadata = {
  title: 'Dans nos bois — La Place',
  description: 'Les champignons de chez nous : les bons comestibles, leurs sosies dangereux, et comment les cuisiner.',
}

/**
 * /bois — « Dans nos bois », le guide des champignons. Public, sans compte.
 *
 * Accessible même quand le bloc du Village est masqué : c'est le bloc qu'on
 * ouvre ou qu'on ferme, jamais la page (cf. lib/visibilite.ts).
 */
export default function BoisPage() {
  return <BoisClient />
}
