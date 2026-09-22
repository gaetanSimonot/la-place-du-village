import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { renderNewsletterBody } from '@/lib/newsletterRender'
import { getCurrentEdition, majEditionEnCours } from '@/lib/newsletterWelcome'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * PUT /api/admin/newsletter/edition  { subject, blocks }
 *
 * « C'EST CETTE VERSION QUI PART. »
 *
 * Met à jour le contenu de la campagne EN COURS, sans toucher à sa date de
 * départ. Ceux qui attendent encore recevront cette version ; ceux qui ont
 * déjà reçu ne sont pas resservis.
 *
 * C'est toute la différence avec un second envoi, et elle vaut deux cents
 * personnes : recliquer « Envoyer » repose une date plus récente, tout le
 * monde redevient « en retard », et la lettre repart à ceux qui l'ont déjà.
 *
 * Sans campagne ouverte, on refuse plutôt que d'en ouvrir une : ce bouton met
 * à jour, il n'envoie pas. Ouvrir une campagne est un geste à part, et il
 * porte son propre bouton.
 */
export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { subject, blocks } = await req.json().catch(() => ({}))
  if (!subject?.trim()) return NextResponse.json({ error: 'Sujet requis' }, { status: 400 })
  if (!(Array.isArray(blocks) && blocks.length)) {
    return NextResponse.json({ error: 'Ajoute au moins une section' }, { status: 400 })
  }

  // Même garde que l'envoi : la liste d'abonnés n'est pas encore territoriale,
  // et l'édition en cours est unique. Mettre à jour depuis la vue Pau
  // changerait la lettre des abonnés cévenols.
  const terr = await territoireDeLaRequete(req.url)
  if (terr && !terr.par_defaut) {
    return NextResponse.json({
      error: `La liste d'abonnés n'est pas encore par territoire : impossible de modifier l'édition en cours depuis la vue ${terr.nom}.`,
    }, { status: 409 })
  }

  const ed = await getCurrentEdition()
  if (!ed) {
    return NextResponse.json({
      error: 'Aucune lettre en cours d’envoi. Utilise « Envoyer » pour en démarrer une.',
    }, { status: 409 })
  }

  // On rend à blanc AVANT de poser : une lettre qui ne se rend pas ne doit
  // pas remplacer celle qui part déjà correctement.
  try {
    await renderNewsletterBody(blocks as NewsletterBlock[], terr?.id ?? null)
  } catch {
    return NextResponse.json({ error: 'Cette version ne se rend pas — rien n’a été changé.' }, { status: 422 })
  }

  const r = await majEditionEnCours(subject, blocks as NewsletterBlock[], terr?.id ?? null)
  if (!r.ok) return NextResponse.json({ error: r.raison }, { status: 409 })

  // Combien de personnes verront cette version-ci : c'est le seul chiffre qui
  // répond à « est-ce que ça a servi à quelque chose ? ».
  const { count } = await supabaseAdmin
    .from('profiles').select('user_id', { count: 'exact', head: true })
    .eq('newsletter_optin', true).not('email', 'is', null)
    .or(`newsletter_welcomed_at.is.null,newsletter_welcomed_at.lt.${ed.sentAt}`)

  return NextResponse.json({ ok: true, restants: count ?? 0 })
}
