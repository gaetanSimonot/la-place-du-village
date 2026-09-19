import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete, territoireParDefaut } from '@/lib/territoires'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserContextFromRequest } from '@/lib/server-auth'
import { normaliserHerosListe, herosVisible } from '@/lib/villageHero'

/**
 * LE HÉROS DU VILLAGE — lecture.
 *
 * C'est le SERVEUR qui décide si le héros part ou non. Le filtrer côté client
 * laisserait le contenu dans la réponse : n'importe qui verrait, dans l'onglet
 * réseau, ce qui n'est ouvert qu'aux admins pendant le rodage.
 *
 * Réponse : { heros: [...] }. Une LISTE, parce que l'encart peut faire défiler
 * plusieurs fiches — vide s'il n'y a rien à montrer. Jamais d'erreur : un
 * héros absent n'est pas une panne, c'est le cas courant.
 *
 * Compatibilité : le champ `heros` reste accompagné, pour l'admin, d'un
 * `eteint` qui dit qu'il ne reste que des fiches invisibles au public.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
// Sans ça, Next met la lecture de config en cache et l'admin continue de voir
// l'ancien héros après l'avoir changé. Cf. le même piège sur /api/splash.
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {

  /*
   * L'EDITORIAL N'EST PAS ENCORE TERRITORIAL — il vit dans `config`, qui n'a
   * qu'une ligne par cle. Plutot que de servir le contenu des Cevennes a un
   * autre territoire, on ne sert RIEN : « Pau n'a pas encore de heros » est vrai,
   * « voici le heros des Cevennes » ne l'est pas.
   *
   * Disparaitra quand `config` deviendra territorial ; d'ici la, cette garde
   * est la seule chose qui empeche un melange visible.
   */
  const terr = await territoireDeLaRequete(req.url)
  const defaut = await territoireParDefaut()
  if (terr && defaut && terr.id !== defaut.id) {
    return NextResponse.json({ heros: [] })
  }
  const { data } = await supabaseAdmin
    .from('config').select('value').eq('key', 'village_hero').maybeSingle()

  const toutes = normaliserHerosListe(data?.value)
  if (!toutes.length) return NextResponse.json({ heros: [] })

  const ctx = await getUserContextFromRequest(req)
  const estAdmin = !!ctx?.isAdmin

  // Chaque fiche porte sa propre visibilité : on peut en préparer une en
  // « admin » pendant qu'une autre tourne déjà pour tout le village.
  const visibles = toutes.filter(h => herosVisible(h, estAdmin))

  if (!visibles.length) {
    // L'admin doit pouvoir les retrouver pour les rallumer : on lui rend les
    // fiches éteintes, avec de quoi savoir qu'elles le sont. Aux autres, rien.
    return NextResponse.json(estAdmin ? { heros: toutes, eteint: true } : { heros: [] })
  }
  return NextResponse.json({ heros: visibles, eteint: false, estAdmin })
}
