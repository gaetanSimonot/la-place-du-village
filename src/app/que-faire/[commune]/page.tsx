import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { communesAVenir, aLaCommune, SEUIL_COMMUNE } from '@/lib/agendaPublic'
import { SITE } from '@/lib/seo'

/** Relue toutes les 15 min. */
export const revalidate = 900

type Props = { params: Promise<{ commune: string }> }

const lire = cache(async (slug: string) => {
  const c = (await communesAVenir()).find(x => x.slug === slug)
  return c && c.evenements.length >= SEUIL_COMMUNE ? c : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { commune } = await params
  const c = await lire(commune)
  if (!c) return { title: 'La Place', robots: { index: false } }
  const titre = `Que faire ${aLaCommune(c.nom)} ?`
  return {
    title: `${titre} Agenda et sorties — La Place`,
    description: `${c.evenements.length} rendez-vous à venir ${aLaCommune(c.nom)} : ${c.evenements.slice(0, 3).map(e => e.titre).join(', ')}…`,
    alternates: { canonical: `${SITE}/que-faire/${c.slug}` },
  }
}

/**
 * /que-faire/<commune> — page d'entrée depuis Google : les rendez-vous à
 * venir (trois mois) d'une commune. Aucun écran de l'app n'y mène. Une
 * commune sans assez d'événements n'a pas de page (404) plutôt qu'une page
 * vide.
 */
export default async function QueFaire({ params }: Props) {
  const { commune } = await params
  const c = await lire(commune)
  if (!c) notFound()
  return (
    <PageAgendaPublic
      titre={`Que faire ${aLaCommune(c.nom)} ?`}
      sousTitre={`Les ${c.evenements.length} prochains rendez-vous ${aLaCommune(c.nom)}.`}
      lienCarte="/?mode=agenda"
      evenements={c.evenements}
      vide=""
    />
  )
}
