import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { monterLettreDeLaSemaine } from '@/lib/newsletterAuto'
import { territoireDeLaRequete } from '@/lib/territoires'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

/*
 * Une config admin lue par une route : les trois directives vont ensemble.
 * `force-dynamic` seul ne suffit pas — Next garde en cache le fetch vers
 * Supabase, et l'editeur rouvre sur le brouillon d'avant la derniere
 * sauvegarde. Piege deja vecu sur /api/splash.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Brouillon de newsletter sauvegardé côté SERVEUR (table config, clé
 * 'newsletter_draft'). Permet de configurer une fois et de retrouver son
 * montage toujours prêt, sur n'importe quel appareil. Les sections "auto"
 * affichent le contenu de la semaine en cours à chaque ouverture.
 *
 * GET → { draft } (objet ou null)
 * PUT { subject, blocks, invite, inviteSubject, fige, retires } → sauvegarde
 *
 * ATTENTION en relisant ce GET : il ne rend pas le brouillon tel quel, il le
 * REMONTE sur la semaine en cours. C'est voulu — et c'est aussi ce qui
 * écrasait les choix de l'admin avant qu'on donne un `mode` à chaque bloc.
 * Comme l'éditeur réenregistre ce qu'il affiche, tout ce que ce GET change
 * finit par être écrit en base : il doit donc ne changer que ce qui n'a pas
 * été décidé à la main.
 */
const KEY = 'newsletter_draft'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  let draft: {
    subject?: string; blocks?: unknown[]; inviteSubject?: string; invite?: unknown
    fige?: boolean; retires?: string[]
  } | null = null
  try { draft = data?.value ? JSON.parse(data.value) : null } catch { draft = null }

  /*
   * La lettre est REMONTÉE à chaque ouverture, sur la semaine en cours.
   *
   * Le brouillon enregistré sert de base — les retouches faites à la main, un
   * texte d'intro, un bouton ajouté, sont donc conservées. Mais tout ce qui
   * dépend de la semaine (le sous-titre, l'article de l'habitant, les bons
   * plans, les deux commerces) est recalculé : ouvrir l'éditeur un lundi doit
   * montrer la lettre de CE lundi, pas celle qu'on avait laissée.
   */
  const terr = (await territoireDeLaRequete(req.url))?.id ?? null
  const auto = await monterLettreDeLaSemaine(
    (draft?.blocks as NewsletterBlock[]) ?? null, terr,
    { fige: !!draft?.fige, retires: draft?.retires ?? [] },
  )

  return NextResponse.json({
    draft: {
      ...(draft ?? {}),
      subject: draft?.subject?.trim() ? draft.subject : auto.subject,
      blocks: auto.blocks,
    },
  })
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'corps invalide' }, { status: 400 })
  const value = JSON.stringify({
    subject: String(body.subject ?? ''),
    inviteSubject: String(body.inviteSubject ?? ''),
    blocks: Array.isArray(body.blocks) ? body.blocks : [],
    invite: body.invite ?? null,
    // Deux réglages de la lettre, pas du contenu : figée, et les sections
    // qu'on a retirées pour qu'elles ne reviennent pas toutes seules.
    fige: !!body.fige,
    retires: Array.isArray(body.retires) ? body.retires.map(String) : [],
  })
  const { error } = await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
