import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { evenementsDuWeekEnd, dansLeTerritoire } from '@/lib/agendaPublic'
import { getDateRange } from '@/lib/filters'
import { territoireParSlug } from '@/lib/territoires'
import { SITE } from '@/lib/seo'

/** Relue toutes les 15 min : le lundi, elle passe d'elle-même au week-end suivant. */
export const revalidate = 900

type Props = { params: Promise<{ territoire: string }> }

const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** « vendredi 13, samedi 14 et dimanche 15 novembre » */
function joursDuWeekEnd(): string {
  const r = getDateRange('ce_week_end')
  if (!r) return ''
  const jours: string[] = []
  for (let t = Date.parse(`${r.from}T12:00:00Z`); t <= Date.parse(`${r.to}T12:00:00Z`); t += 86_400_000) {
    jours.push(fmt.format(new Date(t)))
  }
  // Le mois n'est dit qu'une fois, à la fin, quand il ne change pas.
  const mois = (s: string) => s.split(' ').slice(2).join(' ')
  const memeMois = jours.every(j => mois(j) === mois(jours[jours.length - 1]))
  const courts = memeMois ? jours.map((j, i) => (i < jours.length - 1 ? j.split(' ').slice(0, 2).join(' ') : j)) : jours
  return courts.length > 1 ? `${courts.slice(0, -1).join(', ')} et ${courts[courts.length - 1]}` : courts[0]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { territoire: slug } = await params
  const t = await territoireParSlug(slug)
  if (!t || !t.actif) return { title: 'La Place', robots: { index: false } }
  const evts = await evenementsDuWeekEnd(t.slug)
  const titre = `Que faire ce week-end ${dansLeTerritoire(t)} ?`
  const exemples = evts.slice(0, 3).map(e => e.titre).join(', ')
  return {
    title: `${titre} — La Place`,
    description: evts.length
      ? `${evts.length} sortie${evts.length > 1 ? 's' : ''} ${joursDuWeekEnd()} : ${exemples}…`
      : `Les sorties du week-end ${dansLeTerritoire(t)} : concerts, marchés, fêtes, expositions.`,
    alternates: { canonical: `${SITE}/ce-week-end/${t.slug}` },
  }
}

/**
 * /ce-week-end/<territoire> — page d'entrée depuis Google. Aucun écran de
 * l'app n'y mène. Même sélection que le filtre « Ce week-end » de l'agenda.
 */
export default async function CeWeekEnd({ params }: Props) {
  const { territoire: slug } = await params
  const t = await territoireParSlug(slug)
  if (!t || !t.actif) notFound()
  const evts = await evenementsDuWeekEnd(t.slug)
  return (
    <PageAgendaPublic
      titre={`Que faire ce week-end ${dansLeTerritoire(t)} ?`}
      sousTitre={`${joursDuWeekEnd().replace(/^./, c => c.toUpperCase())}${evts.length ? ` · ${evts.length} sortie${evts.length > 1 ? 's' : ''}` : ''}`}
      lienCarte="/?mode=agenda&quand=ce_week_end"
      evenements={evts}
      vide="Rien d’annoncé pour ce week-end pour l’instant. La carte montre tout ce qui vient."
    />
  )
}
