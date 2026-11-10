import type { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import { lienEvenement } from '@/lib/lienEvenement'
import { ficheRemplie } from '@/lib/etablissementPublic'
import { communesAVenir, SEUIL_COMMUNE } from '@/lib/agendaPublic'
import { territoiresActifs } from '@/lib/territoires'
import { SITE } from '@/lib/seo'

/** Relu toutes les heures. */
export const revalidate = 3600

/**
 * /sitemap.xml — la liste des pages que Google doit connaître.
 *
 *  - les événements publiés à venir, et ceux finis depuis moins de 30 jours
 *    (au-delà, la fiche reste en ligne mais n'est plus proposée) ;
 *  - les films qui ont une séance à venir, tous les spectacles ;
 *  - les commerces REMPLIS (description ou photo) — les autres restent dans
 *    l'app mais ne sont pas proposés ;
 *  - les pages « Ce week-end » et « Que faire à … ».
 *
 * `lastModified` n'est donné que quand la base le connaît vraiment : Google
 * ignore un sitemap qui ment sur ses dates.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const auj = dateParis()
  const il30j = dateParis(-30)
  const out: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/cinema`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE}/theatre`, changeFrequency: 'weekly', priority: 0.6 },
  ]

  for (const t of await territoiresActifs()) {
    out.push({ url: `${SITE}/ce-week-end/${t.slug}`, changeFrequency: 'daily', priority: 0.8 })
  }
  for (const c of await communesAVenir()) {
    if (c.evenements.length >= SEUIL_COMMUNE) out.push({ url: `${SITE}/que-faire/${c.slug}`, changeFrequency: 'daily', priority: 0.7 })
  }

  const { data: evts } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, created_at, publish_at')
    .eq('statut', 'publie')
    .or(`date_fin.gte.${il30j},and(date_fin.is.null,date_debut.gte.${il30j})`)
    .limit(5000)
  const maintenant = Date.now()
  for (const e of evts ?? []) {
    if (e.publish_at && Date.parse(e.publish_at) > maintenant) continue
    out.push({ url: `${SITE}${lienEvenement(e)}`, lastModified: e.created_at ?? undefined, changeFrequency: 'weekly', priority: 0.8 })
  }

  const { data: seances } = await supabaseAdmin.from('seances').select('film_id').gte('date', auj).limit(10000)
  const filmIds = Array.from(new Set((seances ?? []).map(s => s.film_id as string)))
  if (filmIds.length) {
    const { data: films } = await supabaseAdmin.from('films').select('id, updated_at').in('id', filmIds)
    for (const f of films ?? []) out.push({ url: `${SITE}/cinema/film/${f.id}`, lastModified: f.updated_at ?? undefined, changeFrequency: 'daily', priority: 0.6 })
  }

  const { data: spectacles } = await supabaseAdmin.from('spectacles').select('id, updated_at')
  for (const s of spectacles ?? []) out.push({ url: `${SITE}/theatre/spectacle/${s.id}`, lastModified: s.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.6 })

  // Les commerces, par pages de 1000 (plafond d'une lecture PostgREST).
  for (let de = 0; ; de += 1000) {
    const { data: etabs } = await supabaseAdmin
      .from('etablissements')
      .select('id, description_courte, description_longue, updated_at')
      .eq('statut', 'actif')
      .order('id')
      .range(de, de + 999)
    for (const e of etabs ?? []) {
      if (ficheRemplie(e)) out.push({ url: `${SITE}/etablissement/${e.id}`, lastModified: e.updated_at ?? undefined, changeFrequency: 'monthly', priority: 0.5 })
    }
    if (!etabs || etabs.length < 1000) break
  }

  return out
}
