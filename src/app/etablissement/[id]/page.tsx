import { cache } from 'react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lireEtablissementPublic, ficheRemplie } from '@/lib/etablissementPublic'
import { SITE, enJsonLd, jsonLdCommerce } from '@/lib/seo'
import type { Etablissement } from '@/lib/types'
import EtablissementPageClient from './client'

type Props = { params: Promise<{ id: string }> }

const lire = cache(async (id: string) => {
  const r = await lireEtablissementPublic(id)
  return r.ok ? (r.etab as (Etablissement & Record<string, unknown>) | null) : undefined
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const data = await lire(id)
  if (!data) return { title: 'Établissement — La Place', robots: { index: false, follow: false } }

  const url = `${SITE}/etablissement/${id}`
  const imageUrl = (data.photos ?? [])[0] ?? `${SITE}/logo.png`
  const commune = data.commune ? ` · ${data.commune}` : ''
  const description = data.description_courte ?? undefined

  return {
    title: `📍 ${data.nom}${commune} — La Place`,
    description,
    alternates: { canonical: url },
    // Fiche presque vide : elle reste dans l'app, mais Google ne la retient pas.
    robots: ficheRemplie(data) ? undefined : { index: false, follow: true },
    openGraph: {
      title: `📍 ${data.nom}`,
      description,
      url,
      siteName: 'La Place',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: data.nom }],
      type: 'article',
    },
  }
}

/**
 * /etablissement/[id] en accès direct (lien, Google, rechargement) : la fiche
 * arrive remplie. Depuis l'app, c'est la route interceptée (@modal) qui
 * l'ouvre par-dessus l'accueil, sans passer par ici.
 */
export default async function EtablissementPage({ params }: Props) {
  const { id } = await params
  const etab = await lire(id)
  if (etab === null) notFound()
  // Base injoignable : la fiche se charge comme avant, côté téléphone.
  if (!etab) return <EtablissementPageClient id={id} />

  const ld = ficheRemplie(etab) ? jsonLdCommerce(etab, `${SITE}/etablissement/${id}`) : null
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />}
      <EtablissementPageClient id={id} initial={etab} />
    </>
  )
}
