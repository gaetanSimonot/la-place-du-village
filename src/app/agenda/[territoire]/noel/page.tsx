import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { evenementsDeNoel, navNoel, suiteDuResume, typeParSlug, dansLeTerritoire, territoirePublic, PAR_PAGE } from '@/lib/agendaPublic'
import { territoireParSlug } from '@/lib/territoires'
import { SITE } from '@/lib/seo'

/** Toujours lue fraîche : à jour à chaque ouverture (choix du 27/11). */
export const revalidate = 0

type Props = {
  params: Promise<{ territoire: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * /agenda/<territoire>/noel[?type=marches] — « Que faire à Noël dans les
 * Cévennes ? » : tous les rendez-vous de Noël du périmètre (marchés,
 * concerts, crèches, Père Noël…), filtrables par type en haut. Page faite
 * pour être partagée. Territoire fermé (Pau) ou type inconnu → 404.
 */
async function lire(params: Props['params'], searchParams: Props['searchParams']) {
  const { territoire } = await params
  const sp = await searchParams
  const typeSlug = typeof sp.type === 'string' ? sp.type : null
  const t = await territoireParSlug(territoire)
  if (!t || !t.actif || !territoirePublic(t)) return null
  const type = typeSlug ? typeParSlug(typeSlug) : null
  if (typeSlug && !type) return null
  return { t, type, evenements: await evenementsDeNoel(t.slug, type?.cat) }
}

const titreDe = (t: { slug: string; nom: string }, type: { nom: string } | null) =>
  type ? `Noël ${dansLeTerritoire(t)} : ${type.nom.toLowerCase()}` : `Que faire à Noël ${dansLeTerritoire(t)} ?`

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await lire(params, searchParams)
  if (!p) return { title: 'La Place', robots: { index: false } }
  const n = p.evenements.length
  return {
    title: `${titreDe(p.t, p.type)} Marchés de Noël, animations — La Place`,
    description: n
      ? `${n} rendez-vous de Noël ${dansLeTerritoire(p.t)} : marchés de Noël, concerts, crèches, Père Noël… ${p.evenements.slice(0, 3).map(e => e.titre).join(', ')}…`
      : `Les marchés de Noël et animations de Noël ${dansLeTerritoire(p.t)}, sur La Place.`,
    // Une seule adresse pour Google : la page entière. Les filtres sont pour le visiteur.
    alternates: { canonical: `${SITE}/agenda/${p.t.slug}/noel` },
    openGraph: { title: titreDe(p.t, p.type), url: `${SITE}/agenda/${p.t.slug}/noel`, siteName: 'La Place', type: 'website' },
  }
}

export default async function Noel({ params, searchParams }: Props) {
  const p = await lire(params, searchParams)
  if (!p) notFound()
  const n = p.evenements.length
  const nav = await navNoel(p.t, p.type)
  return (
    <PageAgendaPublic
      titre={titreDe(p.t, p.type)}
      resume={{ n, suite: p.type ? 'à venir' : suiteDuResume(n, nav.onglets) }}
      evenements={p.evenements.slice(0, PAR_PAGE)}
      total={n}
      source={{ niveau: 'noel', slug: p.t.slug, ...(p.type ? { type: p.type.slug } : {}) }}
      vide="Rien de prévu pour Noël pour l’instant. La carte montre tout ce qui vient."
      {...nav}
    />
  )
}
