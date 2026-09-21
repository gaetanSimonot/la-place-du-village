import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { listerInvites, remplacerInvites } from '@/lib/invites-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Les invités d'un module — lecture et écriture, ADMIN SEULEMENT.
 *
 * La liste ne transite que par ici. Les pages publiques ne reçoivent qu'un
 * oui ou un non pour le lecteur qui demande : personne ne doit pouvoir
 * apprendre qui a été choisi.
 *
 * `?cle=theatre_village_public` désigne le module, `?territoire=` le
 * territoire — le réglage est éditorial, donc territorial.
 */

/**
 * Les modules qui acceptent des invités.
 *
 * Liste fermée à dessein : `cle` arrive de la requête, et sans ce filtre on
 * pourrait écrire n'importe quoi dans la table, y compris de quoi noyer la
 * lecture d'un vrai module.
 */
const CLES = new Set([
  'theatre_village_public',
  'cinema_village_public',
  'radio_village_public',
  'assistant_visibilite',
])

function cleDeLaRequete(url: string): string | null {
  const cle = new URL(url).searchParams.get('cle')
  return cle && CLES.has(cle) ? cle : null
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const cle = cleDeLaRequete(req.url)
  if (!cle) return NextResponse.json({ error: 'Module inconnu' }, { status: 400 })

  const terr = await territoireDeLaRequete(req.url)
  return NextResponse.json(
    { invites: await listerInvites(cle, terr?.par_defaut ? null : terr?.id ?? null) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const cle = cleDeLaRequete(req.url)
  if (!cle) return NextResponse.json({ error: 'Module inconnu' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const recus = body?.invites
  if (!Array.isArray(recus)) {
    return NextResponse.json({ error: 'Liste manquante' }, { status: 400 })
  }
  // Des identifiants, pas autre chose. On valide à la frontière plutôt que
  // de faire confiance à l'écran qui a envoyé.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const ids: string[] = recus.filter((x: unknown) => typeof x === 'string' && UUID.test(x))
  if (ids.length !== recus.length) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }
  if (ids.length > 50) {
    // Au-delà, ce n'est plus un rodage : c'est une ouverture, et elle a son
    // propre réglage — « Tous ».
    return NextResponse.json({ error: 'Trop d’invités (50 au plus)' }, { status: 400 })
  }

  const terr = await territoireDeLaRequete(req.url)
  const r = await remplacerInvites(cle, terr?.par_defaut ? null : terr?.id ?? null, ids)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true, invites: ids })
}
