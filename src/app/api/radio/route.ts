import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig } from '@/lib/configTerritoire'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseVisibilite } from '@/lib/visibilite'
import { semaineDe, RADIO, type EmissionRadio, type MentionRadio, type PayloadRadio } from '@/lib/radio'
import type { EvenementCard } from '@/lib/types'

/**
 * GET /api/radio — l'émission de la semaine et ce qu'elle annonce.
 *
 * `?semaine=AAAA-MM-JJ` ouvre une semaine précise (un lundi). Sans paramètre,
 * on sert la semaine en cours ; et si elle n'a pas encore d'émission — le
 * montage prend le temps qu'il prend — on sert LA PLUS RÉCENTE publiée plutôt
 * qu'une page vide. Une sélection de la semaine dernière reste utile ; un
 * écran vide n'apprend rien.
 *
 * PUBLIC. La visibilité voyage dans le payload au lieu d'être appliquée en
 * filtre : c'est le composant qui tranche, parce que lui seul sait si le
 * lecteur est admin. Même façon de faire que /api/cinema.
 */

export const revalidate = 0
export const fetchCache = 'force-no-store'

/** Les colonnes d'un `EvenementCard` — la forme qu'attendent la liste ET la carte. */
const SELECT_EVENT =
  'id, titre, categorie, categories, date_debut, date_fin, heure, image_url, image_position, ' +
  'promotion, promo_ordre, radio_selection, vote_count, submitted_by_name, ' +
  'lieux(id, nom, commune, lat, lng, place_id_google)'

export async function GET(req: NextRequest) {

  /*
   * L'EDITORIAL N'EST PAS ENCORE TERRITORIAL — il vit dans `config`, qui n'a
   * qu'une ligne par cle. Plutot que de servir le contenu des Cevennes a un
   * autre territoire, on ne sert RIEN : « Pau n'a pas encore de radio » est vrai,
   * « voici le radio des Cevennes » ne l'est pas.
   *
   * Disparaitra quand `config` deviendra territorial ; d'ici la, cette garde
   * est la seule chose qui empeche un melange visible.
   */
  const terr = await territoireDeLaRequete(req.url)
  const demande = (new URL(req.url).searchParams.get('semaine') ?? '').trim()
  const semaineVoulue = /^\d{4}-\d{2}-\d{2}$/.test(demande) ? demande : null

  const villageVisibilite = parseVisibilite(await lireConfig('radio_village_public', terr))

  const vide: PayloadRadio = { emission: null, mentions: [], villageVisibilite }

  // ── L'émission ────────────────────────────────────────────────────────
  let emission: EmissionRadio | null = null

  if (semaineVoulue) {
    let q = supabaseAdmin
      .from('radio_emissions').select('*')
      .eq('radio', RADIO.cle).eq('statut', 'publie')
      .eq('semaine_debut', semaineVoulue)
    if (terr) q = q.eq('territoire_id', terr.id)
    const { data } = await q.maybeSingle()
    emission = (data as EmissionRadio | null) ?? null
  } else {
    const lundi = semaineDe().debut
    let q = supabaseAdmin
      .from('radio_emissions').select('*')
      .eq('radio', RADIO.cle).eq('statut', 'publie')
      .lte('semaine_debut', lundi)
      .order('semaine_debut', { ascending: false })
      .limit(1)
    if (terr) q = q.eq('territoire_id', terr.id)
    const { data } = await q
    emission = ((data ?? [])[0] as EmissionRadio | undefined) ?? null
  }

  if (!emission) return NextResponse.json(vide, { headers: { 'Cache-Control': 'no-store' } })

  // ── Ce qu'elle cite ───────────────────────────────────────────────────
  const { data: lignes } = await supabaseAdmin
    .from('radio_mentions')
    .select('id, titre, detail, ordre, evenement_id')
    .eq('emission_id', emission.id)
    .order('ordre', { ascending: true })

  const brutes = lignes ?? []

  /*
   * Les fiches en une seconde requête, pas en jointure.
   *
   * PostgREST échoue en SILENCE sur certaines jointures imbriquées — on a déjà
   * perdu des données comme ça. Deux requêtes coûtent un aller-retour et ne
   * mentent jamais.
   *
   * Une fiche peut avoir disparu depuis la diffusion, ou être repassée en
   * attente : la mention reste, elle redevient simplement non cliquable.
   */
  const ids = brutes.map(m => m.evenement_id).filter(Boolean) as string[]
  const parId = new Map<string, EvenementCard>()
  if (ids.length) {
    const { data: events } = await supabaseAdmin
      .from('evenements').select(SELECT_EVENT)
      .in('id', ids).eq('statut', 'publie')
    for (const e of (events ?? []) as unknown as EvenementCard[]) parId.set(e.id, e)
  }

  const mentions: MentionRadio[] = brutes.map(m => ({
    id: m.id as string,
    titre: m.titre as string,
    detail: (m.detail as string | null) ?? null,
    ordre: (m.ordre as number) ?? 0,
    evenement: m.evenement_id ? parId.get(m.evenement_id as string) ?? null : null,
  }))

  return NextResponse.json(
    { emission, mentions, villageVisibilite } satisfies PayloadRadio,
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
