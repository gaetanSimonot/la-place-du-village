import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { communeDePage, aLaCommune, categoriesDe, navCommune, suiteDuResume, typeParSlug } from '@/lib/agendaPublic'
import { SITE } from '@/lib/seo'

/** Relue toutes les 15 min. */
export const revalidate = 900

type Props = { params: Promise<{ commune: string; type: string }> }

/**
 * Un type dans une commune : « Concerts à Ganges ». Commune inconnue, de Pau
 * (pas encore ouvert) ou type inconnu → 404 ; commune connue sans rien de ce
 * type → la page reste, « rien de prévu » (elle n'est simplement plus annoncée).
 */
const lire = cache(async (slug: string, typeSlug: string) => {
  const type = typeParSlug(typeSlug)
  if (!type) return null
  const c = await communeDePage(slug)
  if (!c) return null
  return { nom: c.nom, slug, type, tous: c.evenements.length, evenements: c.evenements.filter(e => categoriesDe(e).includes(type.cat)) }
})

const titreDe = (p: { nom: string; type: { nom: string } }) => `${p.type.nom} ${aLaCommune(p.nom)}`

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { commune, type } = await params
  const p = await lire(commune, type)
  if (!p) return { title: 'La Place', robots: { index: false } }
  const n = p.evenements.length
  // Tout ce qui est prévu dans la commune est de ce type : la page répète
  // « Que faire à X », c'est elle que Google doit retenir.
  const doublon = n > 0 && n === p.tous
  return {
    title: `${titreDe(p)} : agenda et dates — La Place`,
    description: n
      ? `${n} rendez-vous à venir ${aLaCommune(p.nom)} : ${p.evenements.slice(0, 3).map(e => e.titre).join(', ')}…`
      : `${p.type.nom} ${aLaCommune(p.nom)} et alentour : l'agenda des sorties sur La Place.`,
    alternates: { canonical: doublon ? `${SITE}/que-faire/${p.slug}` : `${SITE}/que-faire/${p.slug}/${p.type.slug}` },
  }
}

export default async function TypeCommune({ params }: Props) {
  const { commune, type } = await params
  const p = await lire(commune, type)
  if (!p) notFound()
  const n = p.evenements.length
  const nav = await navCommune(p.slug, p.type)
  return (
    <PageAgendaPublic
      titre={titreDe(p)}
      resume={{ n, suite: suiteDuResume(n, []) }}
      evenements={p.evenements}
      vide="Les autres sorties de la commune sont dans les pastilles ci-dessus, et toutes sur la carte."
      {...nav}
    />
  )
}
