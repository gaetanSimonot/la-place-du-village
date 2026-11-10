import { cache } from 'react'
import { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CATEGORIES } from '@/lib/categories'
import { Categorie, Evenement } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { imageEvenement } from '@/lib/imageEvenement'
import { idEvenementDe, lienEvenement } from '@/lib/lienEvenement'
import { SITE, communeDe, enJsonLd, jsonLdEvenement } from '@/lib/seo'
import EvenementPageClient from './client'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type Ligne = Evenement & { statut: string; publish_at: string | null }

/**
 * La fiche lue UNE fois par requête : generateMetadata et la page partagent
 * ce résultat (cache de React), au lieu d'interroger la base deux fois.
 */
const lire = cache(async (id: string): Promise<Ligne | null> => {
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('*, lieux(*)')
    .eq('id', id)
    .maybeSingle()
  return (data as Ligne | null) ?? null
})

/**
 * Publique = publiée, et pas programmée pour plus tard. La lecture se fait
 * avec la clé admin, qui voit tout : c'est ICI que se décide ce qui sort.
 * Une fiche refusée ou en attente ne livre ni son titre ni son contenu.
 */
const publique = (e: Ligne) =>
  e.statut === 'publie' && (!e.publish_at || Date.parse(e.publish_at) <= Date.now())

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: param } = await params
  const evt = await lire(idEvenementDe(param))
  if (!evt || !publique(evt)) return { title: 'Événement — La Place', robots: { index: false, follow: false } }

  const cat = CATEGORIES[evt.categorie as Categorie] ?? CATEGORIES.autre
  const dateStr = evt.date_debut ? formatDate(evt.date_debut) : ''
  const commune = communeDe(evt.lieux)
  const description = [dateStr + (commune ? ` · ${commune}` : ''), evt.description?.slice(0, 160)]
    .filter(Boolean).join(' — ')

  const url = `${SITE}${lienEvenement(evt)}`
  const imageUrl = evt.image_url ?? `${SITE}/logo.png`

  return {
    title: `${cat.emoji} ${evt.titre} — La Place`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${cat.emoji} ${evt.titre}`,
      description,
      url,
      siteName: 'La Place',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: evt.titre }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${cat.emoji} ${evt.titre}`,
      description,
      images: [imageUrl],
    },
  }
}

/**
 * /evenement/<nom>-<id>
 *
 * La fiche arrive REMPLIE : titre, date, lieu, prix, description sont dans
 * le HTML envoyé, lisibles par Google sans exécuter de JavaScript. Le
 * composant client la reprend telle quelle, puis se rafraîchit.
 *
 * Toute autre adresse de la même fiche (l'adresse nue /evenement/<id> des
 * notifications, un ancien titre) renvoie ici par redirection permanente, en
 * gardant ses paramètres (?correction=1 des notifications admin).
 */
export default async function EvenementPage({ params, searchParams }: Props) {
  const { id: param } = await params
  const id = idEvenementDe(param)
  const evt = await lire(id)
  if (!evt) notFound()

  // Pas publique : la fiche se charge comme avant, côté téléphone, sous les
  // droits de la personne (un admin la voit, les autres non).
  if (!publique(evt)) return <EvenementPageClient id={id} />

  const voulu = lienEvenement(evt)
  if (`/evenement/${param}` !== voulu) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(await searchParams)) {
      if (typeof v === 'string') sp.set(k, v)
      else v?.forEach(x => sp.append(k, x))
    }
    const q = sp.toString()
    permanentRedirect(q ? `${voulu}?${q}` : voulu)
  }

  /*
   * Ce que la fiche passe au composant part DANS LE HTML. Les champs de
   * collecte et de modération (téléphone de qui a transmis l'info, groupe
   * WhatsApp d'origine, raison du tri) n'ont rien à y faire : retirés ici.
   */
  const { source_telephone: _t, source_auteur: _a, source_groupe: _g, raison_statut: _r, message_entrant_id: _m, score_confiance: _s, ...affichable } =
    evt as Ligne & Record<string, unknown>
  void _t; void _a; void _g; void _r; void _m; void _s

  const ld = jsonLdEvenement(evt, `${SITE}${voulu}`, imageEvenement(evt))
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />}
      <EvenementPageClient id={id} initial={affichable as unknown as Evenement} />
    </>
  )
}
