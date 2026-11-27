import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { communeDePage, aLaCommune, navCommune, suiteDuResume, PAR_PAGE } from '@/lib/agendaPublic'
import { SITE } from '@/lib/seo'

/** Toujours lue fraîche : à jour à chaque ouverture (choix du 27/11). */
export const revalidate = 0

type Props = { params: Promise<{ commune: string }> }

/**
 * La commune et ses rendez-vous à venir. Sous le seuil, elle garde sa page
 * (avec ce qui reste, ou « rien de prévu ») ; une adresse qui ne correspond
 * à aucune commune connue, ou une commune de Pau (pas encore ouvert), → 404.
 */
const lire = cache(communeDePage)

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
 * venir (trois mois) d'une commune. Les fiches événement y mènent. Sous le
 * seuil, la page reste (hors sitemap) : une commune qui y repasse ne laisse
 * pas un 404 à Google.
 */
export default async function QueFaire({ params }: Props) {
  const { commune } = await params
  const c = await lire(commune)
  if (!c) notFound()
  const nav = await navCommune(c.slug, null)
  return (
    <PageAgendaPublic
      titre={`Que faire ${aLaCommune(c.nom)} ?`}
      resume={{ n: c.evenements.length, suite: suiteDuResume(c.evenements.length, nav.onglets) }}
      evenements={c.evenements.slice(0, PAR_PAGE)}
      total={c.evenements.length}
      source={{ niveau: 'commune', slug: c.slug }}
      vide="Les rendez-vous des communes voisines sont juste en dessous, et tous sur la carte."
      {...nav}
    />
  )
}
