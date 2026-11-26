import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { communesAVenir, communeConnue, aLaCommune, SEUIL_COMMUNE } from '@/lib/agendaPublic'
import { SITE } from '@/lib/seo'

/** Relue toutes les 15 min. */
export const revalidate = 900

type Props = { params: Promise<{ commune: string }> }

/**
 * La commune et ses rendez-vous à venir. Sous le seuil, elle garde sa page
 * (avec ce qui reste, ou « rien de prévu ») ; seule une adresse qui ne
 * correspond à aucune commune connue donne un 404.
 */
const lire = cache(async (slug: string) => {
  const c = (await communesAVenir()).find(x => x.slug === slug)
  if (c && c.evenements.length >= SEUIL_COMMUNE) return c
  const nom = c?.nom ?? await communeConnue(slug)
  return nom ? { nom, slug, evenements: c?.evenements ?? [] } : null
})

function sousTitre(nom: string, n: number): string {
  if (n === 0) return `Rien de prévu pour l'instant ${aLaCommune(nom)}.`
  if (n === 1) return `Le prochain rendez-vous ${aLaCommune(nom)}.`
  return `Les ${n} prochains rendez-vous ${aLaCommune(nom)}.`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { commune } = await params
  const c = await lire(commune)
  if (!c) return { title: 'La Place', robots: { index: false } }
  const titre = `Que faire ${aLaCommune(c.nom)} ?`
  return {
    title: `${titre} Agenda et sorties — La Place`,
    description: c.evenements.length
      ? `${c.evenements.length} rendez-vous à venir ${aLaCommune(c.nom)} : ${c.evenements.slice(0, 3).map(e => e.titre).join(', ')}…`
      : `L'agenda des sorties ${aLaCommune(c.nom)} et alentour, sur La Place.`,
    alternates: { canonical: `${SITE}/que-faire/${c.slug}` },
  }
}

/**
 * /que-faire/<commune> — page d'entrée depuis Google : les rendez-vous à
 * venir (trois mois) d'une commune. Aucun écran de l'app n'y mène. Sous le
 * seuil, la page reste (hors sitemap) : une commune qui y repasse ne laisse
 * pas un 404 à Google.
 */
export default async function QueFaire({ params }: Props) {
  const { commune } = await params
  const c = await lire(commune)
  if (!c) notFound()
  return (
    <PageAgendaPublic
      titre={`Que faire ${aLaCommune(c.nom)} ?`}
      sousTitre={sousTitre(c.nom, c.evenements.length)}
      lienCarte="/?mode=agenda"
      evenements={c.evenements}
      vide="Les rendez-vous des communes voisines sont dans l'agenda : bouton « Voir sur la carte » ci-dessous."
    />
  )
}
