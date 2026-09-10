import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CLE_BATTEMENT } from '@/lib/collector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Battement de cœur du collector (téléphone Termux).
 *
 * Pourquoi cet endpoint existe : le collector tourne sur un Galaxy A23 de
 * 3,4 Go. Quand Android manque de mémoire, il tue l'application Termux
 * ENTIÈRE — moteur, signal-cli et le chien de garde d'un seul coup. Le chien
 * de garde vivant dans Termux, il meurt avec ce qu'il surveille et rien sur le
 * téléphone ne peut se relever. C'est arrivé le 09/09/2026 : 24 h de collecte
 * perdues, découvertes le lendemain à la main.
 *
 * On ne peut pas empêcher ce coup de balai depuis le serveur, mais on peut le
 * VOIR. Le collector appelle cette route à la fin de chaque cycle de collecte,
 * même quand il n'a rien trouvé à envoyer.
 *
 * Pourquoi ne pas simplement surveiller les arrivées dans `messages_entrants` :
 * parce que ce signal dit « les gens postent », pas « le collector est vivant ».
 * Mesuré sur un mois : les silences nocturnes légitimes montent jusqu'à 14 h.
 * Alerter là-dessus, ce serait une fausse alerte chaque matin, ou un seuil si
 * haut qu'il ne vaudrait guère mieux que de s'en apercevoir tout seul.
 *
 * Authentification : la même clé partagée que /api/inbox, que le collector
 * envoie déjà (`x-wa-key`). Pas de nouveau secret à installer sur le téléphone.
 */
export async function POST(req: NextRequest) {
  const cle = req.headers.get('x-wa-key')
  if (!cle || cle !== process.env.WHATSAPP_API_KEY) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let corps: unknown = {}
  try { corps = await req.json() } catch { /* un ping sans corps reste valide */ }
  const c = (corps ?? {}) as Record<string, unknown>

  // Rien de ce que raconte le téléphone n'est cru sur parole : l'heure fait foi
  // côté serveur, le reste est borné avant d'être stocké.
  const entier = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : null

  const valeur = JSON.stringify({
    at:       new Date().toISOString(),
    posts:    entier(c.posts),      // trouvés lors de ce cycle (0 est normal)
    envoyes:  entier(c.envoyes),    // effectivement déposés dans l'inbox
    whatsapp: c.whatsapp === true,  // moteur WhatsApp connecté
    signal:   c.signal === true,    // daemon signal-cli joignable
  })

  const { error } = await supabaseAdmin
    .from('config')
    .upsert({ key: CLE_BATTEMENT, value: valeur }, { onConflict: 'key' })

  if (error) {
    console.error('[collector/ping] écriture échouée', error)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
