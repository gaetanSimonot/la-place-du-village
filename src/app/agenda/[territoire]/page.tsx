import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { evenementsDuWeekEnd, evenementsDuTerritoire, liensTerritoire, titreTerritoire, dansLeTerritoire } from '@/lib/agendaPublic'
import { territoireParSlug } from '@/lib/territoires'
import { SITE } from '@/lib/seo'

/** Relue toutes les 15 min. */
export const revalidate = 900

type Props = { params: Promise<{ territoire: string }> }

/** Cartes montrées en tête : de quoi voir tout de suite, pas tout l'agenda. */
const EN_TETE = 12

/**
 * Ce que la page montre en tête : le week-end s'il y a quelque chose,
 * sinon les prochains rendez-vous du territoire.
 */
async function selection(slug: string) {
  const we = await evenementsDuWeekEnd(slug)
  if (we.length) return { titre: 'Ce week-end', evenements: we.slice(0, EN_TETE) }
  return { titre: 'Prochainement', evenements: (await evenementsDuTerritoire(slug)).slice(0, EN_TETE) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { territoire: slug } = await params
  const t = await territoireParSlug(slug)
  if (!t || !t.actif) return { title: 'La Place', robots: { index: false } }
  const n = (await evenementsDuTerritoire(t.slug)).length
  return {
    title: `${titreTerritoire(t)} Agenda, concerts, marchés, sorties — La Place`,
    description: `${n} rendez-vous à venir ${dansLeTerritoire(t)} : concerts, théâtre, marchés, ateliers, fêtes, commune par commune.`,
    alternates: { canonical: `${SITE}/agenda/${t.slug}` },
  }
}

/**
 * /agenda/<territoire> — le sommet des pages d'entrée : « Que faire dans les
 * Cévennes ? ». Une sélection, puis toutes les communes et tous les types.
 */
export default async function AgendaTerritoire({ params }: Props) {
  const { territoire: slug } = await params
  const t = await territoireParSlug(slug)
  if (!t || !t.actif) notFound()
  const [sel, n, liens] = await Promise.all([selection(t.slug), evenementsDuTerritoire(t.slug), liensTerritoire(t)])
  return (
    <PageAgendaPublic
      titre={titreTerritoire(t)}
      sousTitre={n.length ? `${n.length} rendez-vous dans les trois prochains mois, commune par commune et par type.` : 'Rien d’annoncé pour l’instant.'}
      lienCarte="/?mode=agenda"
      titreListe={sel.titre}
      evenements={sel.evenements}
      vide="Rien d’annoncé pour l’instant. La carte montre tout ce qui vient."
      liens={liens}
    />
  )
}
