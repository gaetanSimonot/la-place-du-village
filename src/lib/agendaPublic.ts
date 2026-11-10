import { NextRequest } from 'next/server'
import { GET as lireAgenda } from '@/app/api/agenda/route'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import { SITE, communeDe, slugCommune } from '@/lib/seo'
import type { Evenement } from '@/lib/types'

/**
 * LES PAGES D'ENTRÉE DEPUIS GOOGLE — « Que faire ce week-end dans les
 * Cévennes », « Que faire au Vigan ».
 *
 * Aucun écran de l'app n'y mène : elles existent pour qu'une recherche
 * générale tombe sur La Place, puis renvoient vers la carte et les fiches.
 * SERVEUR UNIQUEMENT.
 */

/** « dans les Cévennes », « autour de Pau ». */
export function dansLeTerritoire(t: { slug: string; nom: string }): string {
  return t.slug === 'cevennes' ? 'dans les Cévennes' : `autour de ${t.nom}`
}

/** « à Ganges », « au Vigan », « aux Plantiers », « à La Salle ». */
export function aLaCommune(nom: string): string {
  if (/^Le\s/i.test(nom)) return `au ${nom.slice(3)}`
  if (/^Les\s/i.test(nom)) return `aux ${nom.slice(4)}`
  return `à ${nom}`
}

/**
 * Le week-end, avec EXACTEMENT la sélection du filtre « Ce week-end » de
 * l'agenda : on appelle la même route, pas une copie de sa requête. Les
 * événements déjà passés (vendredi, vu du dimanche) sont écartés.
 */
export async function evenementsDuWeekEnd(territoireSlug: string): Promise<Evenement[]> {
  const res = await lireAgenda(new NextRequest(
    `${SITE}/api/agenda?quand=ce_week_end&masquerPasses=1&territoire=${encodeURIComponent(territoireSlug)}`))
  const j = await res.json() as { evenements?: Evenement[] }
  return j.evenements ?? []
}

export interface Commune { nom: string; slug: string; evenements: Evenement[] }

/**
 * Les communes qui ont des événements à venir (trois mois), avec ces
 * événements. La commune est lue sur le lieu, ou à défaut dans son adresse.
 */
export async function communesAVenir(): Promise<Commune[]> {
  const auj = dateParis()
  const fin = dateParis(92)
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, categorie, categories, date_debut, date_fin, heure, jours_semaine, dates, image_url, image_position, promotion, promo_ordre, radio_selection, lieux(id, nom, commune, adresse, lat, lng, place_id_google)')
    .eq('statut', 'publie')
    .lte('date_debut', fin)
    .or(`date_fin.gte.${auj},and(date_fin.is.null,date_debut.gte.${auj})`)
    .order('date_debut')
    .order('heure', { nullsFirst: false })
    .limit(2000)

  const parSlug = new Map<string, Commune>()
  for (const e of (data ?? []) as unknown as Evenement[]) {
    const nom = communeDe(e.lieux as { commune?: string | null; adresse?: string | null } | null)
    if (!nom) continue
    const slug = slugCommune(nom)
    if (!slug) continue
    const c = parSlug.get(slug) ?? { nom, slug, evenements: [] }
    c.evenements.push(e)
    parSlug.set(slug, c)
  }
  return Array.from(parSlug.values()).sort((a, b) => b.evenements.length - a.evenements.length)
}

/** Une commune n'a sa page qu'à partir de deux événements à venir : une page d'un seul lien n'apprend rien. */
export const SEUIL_COMMUNE = 2
