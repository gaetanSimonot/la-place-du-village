import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { evenementsDuTerritoire, navTerritoire, suiteDuResume, typeParSlug, dansLeTerritoire, territoirePublic, PAR_PAGE } from '@/lib/agendaPublic'
import { territoireParSlug } from '@/lib/territoires'
import { SITE } from '@/lib/seo'

/** Toujours lue fraîche : à jour à chaque ouverture (choix du 27/11). */
export const revalidate = 0

type Props = { params: Promise<{ territoire: string; type: string }> }

/** Territoire ouvert et type connu, sinon 404. */
async function lire(slug: string, typeSlug: string) {
  const type = typeParSlug(typeSlug)
  const t = await territoireParSlug(slug)
  if (!type || !t || !t.actif || !territoirePublic(t)) return null
  return { t, type, evenements: await evenementsDuTerritoire(t.slug, type.cat) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { territoire, type } = await params
  const p = await lire(territoire, type)
  if (!p) return { title: 'La Place', robots: { index: false } }
  const n = p.evenements.length
  return {
    title: `${p.type.nom} ${dansLeTerritoire(p.t)} : agenda et dates — La Place`,
    description: n
      ? `${n} rendez-vous à venir ${dansLeTerritoire(p.t)} : ${p.evenements.slice(0, 3).map(e => e.titre).join(', ')}…`
      : `${p.type.nom} ${dansLeTerritoire(p.t)} : l'agenda des sorties sur La Place.`,
    alternates: { canonical: `${SITE}/agenda/${p.t.slug}/${p.type.slug}` },
  }
}

/** /agenda/<territoire>/<type> — « Concerts dans les Cévennes ». */
export default async function TypeTerritoire({ params }: Props) {
  const { territoire, type } = await params
  const p = await lire(territoire, type)
  if (!p) notFound()
  const n = p.evenements.length
  const nav = await navTerritoire(p.t, p.type)
  return (
    <PageAgendaPublic
      titre={`${p.type.nom} ${dansLeTerritoire(p.t)}`}
      resume={{ n, suite: suiteDuResume(n, []) }}
      evenements={p.evenements.slice(0, PAR_PAGE)}
      total={n}
      source={{ niveau: 'territoire', slug: p.t.slug, type: p.type.slug }}
      vide="Les autres sorties sont dans les pastilles ci-dessus, et toutes sur la carte."
      {...nav}
    />
  )
}
