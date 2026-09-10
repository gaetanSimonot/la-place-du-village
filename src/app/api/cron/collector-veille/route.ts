import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdmins } from '@/lib/server-auth'
import { CLE_BATTEMENT, SEUIL_SILENCE_H, RAPPEL_H } from '@/lib/collector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Cron horaire — veille sur le collector du téléphone.
 *
 * Le collector tourne dans Termux sur un téléphone de 3,4 Go. Android tue
 * l'application entière quand la mémoire manque, et le chien de garde, qui vit
 * dedans, part avec elle : plus rien sur place ne peut se relever. Le 09/09/2026
 * ça a coûté 24 h de collecte, découvertes le lendemain par hasard.
 *
 * Ce cron ne répare rien — il ne peut pas, le téléphone n'est joignable de
 * nulle part (l'interface écoute sur 127.0.0.1). Il fait la seule chose utile :
 * transformer un trou de 24 h en un trou de 3 h, en envoyant une notification
 * push à Gaëtan. Le geste de réparation reste le même : appuyer sur l'icône
 * Collector.
 *
 * Tant qu'aucun battement n'a jamais été reçu, on se tait : la veille s'arme
 * toute seule au premier ping, ce qui évite une fausse alerte entre le
 * déploiement de l'app et la mise à jour du collector sur le téléphone.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const isAuthorized = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ligne } = await supabaseAdmin
    .from('config')
    .select('value')
    .eq('key', CLE_BATTEMENT)
    .maybeSingle()

  let dernier: Date | null = null
  try {
    const v = ligne?.value ? JSON.parse(ligne.value) as { at?: string } : null
    if (v?.at) {
      const d = new Date(v.at)
      if (!Number.isNaN(d.getTime())) dernier = d
    }
  } catch { /* valeur illisible : traitée comme absente */ }

  if (!dernier) {
    return NextResponse.json({ ok: true, etat: 'jamais_arme' })
  }

  const silenceH = (Date.now() - dernier.getTime()) / 3_600_000
  if (silenceH < SEUIL_SILENCE_H) {
    return NextResponse.json({ ok: true, etat: 'vivant', silenceH: +silenceH.toFixed(1) })
  }

  // Déjà prévenu récemment ? On regarde la dernière notification de ce type
  // plutôt que de tenir un état à part : une notification EST la trace.
  const { data: derniereAlerte } = await supabaseAdmin
    .from('notifications')
    .select('created_at')
    .eq('type', 'collector_muet')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (derniereAlerte?.created_at) {
    const depuisH = (Date.now() - new Date(derniereAlerte.created_at).getTime()) / 3_600_000
    if (depuisH < RAPPEL_H) {
      return NextResponse.json({ ok: true, etat: 'muet_deja_signale', silenceH: +silenceH.toFixed(1) })
    }
  }

  // `target_type` est volontairement omis : la colonne porte une contrainte
  // CHECK et une valeur hors liste ferait échouer l'INSERT en silence.
  await notifyAdmins({
    type:       'collector_muet',
    actor_name: silenceH < 24 ? `${Math.round(silenceH)} h` : `${Math.floor(silenceH / 24)} jours`,
  })

  return NextResponse.json({ ok: true, etat: 'alerte_envoyee', silenceH: +silenceH.toFixed(1) })
}
