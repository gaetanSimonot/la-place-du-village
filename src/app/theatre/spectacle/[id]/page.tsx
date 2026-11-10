import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lireSpectacle } from '@/lib/theatre-server'
import { SITE, enJsonLd, jsonLdSpectacle } from '@/lib/seo'
import SpectacleClient from './client'

type Props = { params: Promise<{ id: string }> }

const lire = cache((id: string) => lireSpectacle(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const p = await lire(id)
  if (!p) return { title: 'Spectacle — La Place', robots: { index: false, follow: false } }
  const sp = p.spectacle
  const description = [
    sp.compagnie ? `${sp.compagnie}.` : '',
    sp.synopsis?.slice(0, 200) ?? '',
  ].filter(Boolean).join(' ') || `${sp.titre} : les représentations près de chez vous.`
  const url = `${SITE}/theatre/spectacle/${id}`
  return {
    title: `${sp.titre} — Au théâtre — La Place`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: sp.titre, description, url, siteName: 'La Place', type: 'article',
      images: sp.affiche_url ? [{ url: sp.affiche_url, alt: sp.titre }] : undefined,
    },
  }
}

/** /theatre/spectacle/[id] — la fiche d'un spectacle et toutes ses dates. */
export default async function SpectaclePage({ params }: Props) {
  const { id } = await params
  const p = await lire(id)
  if (!p) notFound()

  // Les dates à venir ouvertes au public (les scolaires ne le sont pas), à
  // l'endroit où elles se jouent : hors les murs si c'est écrit, sinon la salle.
  const salles = new Map(p.theatres.map(t => [t.id, t]))
  const lieux = new Map(p.lieux.map(l => [l.nom, l]))
  const dates = p.representations
    .filter(r => r.date >= p.aujourdhui && !r.scolaire)
    .map(r => ({ date: r.date, heure: r.heure, lieu: (r.lieu && lieux.get(r.lieu)) || salles.get(r.etablissement_id) }))
  const ld = jsonLdSpectacle(p.spectacle, `${SITE}/theatre/spectacle/${id}`, dates)
  return (
    <>
      {ld.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />}
      <SpectacleClient id={id} initial={p} />
    </>
  )
}
