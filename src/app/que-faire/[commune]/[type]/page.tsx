import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageAgendaPublic from '@/components/PageAgendaPublic'
import { communesAVenir, communeConnue, aLaCommune, categoriesDe, liensTypeCommune, typeParSlug } from '@/lib/agendaPublic'
import { SITE } from '@/lib/seo'

/** Relue toutes les 15 min. */
export const revalidate = 900

type Props = { params: Promise<{ commune: string; type: string }> }

/**
 * Un type dans une commune : « Concerts à Ganges ». Commune inconnue ou type
 * inconnu → 404 ; commune connue sans rien de ce type → la page reste,
 * « rien de prévu » (elle n'est simplement plus annoncée).
 */
const lire = cache(async (slug: string, typeSlug: string) => {
  const type = typeParSlug(typeSlug)
  if (!type) return null
  const c = (await communesAVenir()).find(x => x.slug === slug)
  const nom = c?.nom ?? await communeConnue(slug)
  if (!nom) return null
  const tous = c?.evenements ?? []
  return { nom, slug, type, tous: tous.length, evenements: tous.filter(e => categoriesDe(e).includes(type.cat)) }
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
  return (
    <PageAgendaPublic
      titre={titreDe(p)}
      sousTitre={n === 0 ? 'Rien de prévu pour l’instant.' : n === 1 ? 'Le prochain rendez-vous.' : `Les ${n} prochains rendez-vous.`}
      lienCarte="/?mode=agenda"
      evenements={p.evenements}
      vide="Les autres sorties sont dans les liens ci-dessous, et toutes sur la carte."
      liens={await liensTypeCommune(p.slug, p.type)}
    />
  )
}
