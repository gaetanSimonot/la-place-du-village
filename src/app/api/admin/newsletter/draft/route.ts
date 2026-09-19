import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { monterLettreDeLaSemaine } from '@/lib/newsletterAuto'
import { territoireDeLaRequete } from '@/lib/territoires'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

/**
 * Brouillon de newsletter sauvegardé côté SERVEUR (table config, clé
 * 'newsletter_draft'). Permet de configurer une fois et de retrouver son
 * montage toujours prêt, sur n'importe quel appareil. Les sections "auto"
 * affichent le contenu de la semaine en cours à chaque ouverture.
 *
 * GET → { draft } (objet ou null)
 * PUT { subject, blocks, invite, inviteSubject } → sauvegarde
 */
const KEY = 'newsletter_draft'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  let draft: { subject?: string; blocks?: unknown[]; inviteSubject?: string; invite?: unknown } | null = null
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
  const auto = await monterLettreDeLaSemaine((draft?.blocks as NewsletterBlock[]) ?? null, terr)

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
  })
  const { error } = await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
