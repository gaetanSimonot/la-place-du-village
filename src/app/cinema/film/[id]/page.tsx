import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lireFilm } from '@/lib/cinema-server'
import { territoireParDefaut } from '@/lib/territoires'
import { SITE, enJsonLd, jsonLdFilm } from '@/lib/seo'
import FilmClient from './client'

type Props = { params: Promise<{ id: string }> }

/**
 * Le film et ses séances dans le territoire par défaut : c'est la version
 * que lisent les moteurs. L'app, elle, recharge celle de la ville regardée.
 */
const lire = cache(async (id: string) => {
  const terr = await territoireParDefaut()
  const p = await lireFilm(id, terr?.id ?? null)
  return p ? { ...p, territoireId: terr?.id ?? null } : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const p = await lire(id)
  if (!p) return { title: 'Film — La Place', robots: { index: false, follow: false } }
  const f = p.film
  const titre = `${f.titre}${f.annee ? ` (${f.annee})` : ''} — Au cinéma — La Place`
  const description = [
    f.realisateur ? `Un film de ${f.realisateur}.` : '',
    f.synopsis?.slice(0, 200) ?? '',
  ].filter(Boolean).join(' ') || `${f.titre} : les séances près de chez vous.`
  const url = `${SITE}/cinema/film/${id}`
  return {
    title: titre,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: f.titre, description, url, siteName: 'La Place', type: 'article',
      images: f.affiche_url ? [{ url: f.affiche_url, alt: f.titre }] : undefined,
    },
  }
}

/** /cinema/film/[id] — la fiche d'un film et toutes ses séances à venir. */
export default async function FilmPage({ params }: Props) {
  const { id } = await params
  const p = await lire(id)
  if (!p) notFound()

  const salles = new Map(p.cinemas.map(c => [c.id, c]))
  const ld = jsonLdFilm(p.film, `${SITE}/cinema/film/${id}`,
    p.seances.map(s => ({ date: s.date, heure: s.heure, salle: salles.get(s.etablissement_id) })))
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />
      <FilmClient id={id} initial={p} />
    </>
  )
}
