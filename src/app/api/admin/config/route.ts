import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { ecrireConfig, estEditoriale } from '@/lib/configTerritoire'

/**
 * Ecrire un reglage, POUR LE TERRITOIRE QU'ON ADMINISTRE.
 *
 * `?territoire=<slug>` dit lequel. Sans parametre — donc pour tout ce qui
 * existait avant — c'est le territoire par defaut, et l'ecriture va dans
 * `config` exactement comme avant : meme table, meme `onConflict: 'key'`.
 *
 * Un reglage EDITORIAL (le heros, le splash, la lettre) ecrit dans
 * `config_territoire` quand on administre un autre territoire. Un reglage
 * TECHNIQUE (maintenance, style de carte) reste global : il n'y a aucune
 * raison d'avoir deux modes maintenance, et se tromper la se verrait par
 * tout le monde. La regle vit dans CLES_EDITORIALES, pas ici.
 */
export async function PATCH(req: NextRequest) {
  // Garde admin : la route utilise service_role (bypass RLS) → sans cette
  // garde, tout user connecté pouvait modifier la config globale.
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { key, value } = await req.json()
  if (typeof key !== 'string' || !key.trim()) {
    return NextResponse.json({ error: 'Clé manquante' }, { status: 400 })
  }

  const terr = await territoireDeLaRequete(req.url)
  // Une cle technique s'ecrit toujours au niveau global, quel que soit le
  // territoire administre.
  const cible = estEditoriale(key) ? terr : null

  const r = await ecrireConfig(key, String(value), cible)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true, territoire: cible?.slug ?? null })
}
