import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { welcomeProfile, welcomeExtra } from '@/lib/newsletterWelcome'

/**
 * POST /api/newsletter/subscribe { email } — abonnement PUBLIC, sans compte.
 *
 * Pourquoi cette route existe : la lettre ne se ramassait que par la case à
 * cocher de l'inscription, le réglage du profil, ou la main de l'admin. Un
 * visiteur qui donne son adresse depuis le site n'avait aucun chemin ; l'encart
 * du village l'envoyait sur /newsletter, qui est l'écran de CONFIRMATION d'un
 * lien reçu par mail et répond « Lien invalide » sans jeton.
 *
 * Elle ne crée rien de neuf : elle emprunte exactement les deux voies que
 * l'admin utilise déjà (POST /api/admin/newsletter), profil ou adresse externe.
 *
 * Ouverte sans authentification, à dessein — c'est tout l'objet. Trois gardes :
 *   • l'unicité de l'adresse en base, donc un renvoi ne crée pas de doublon ;
 *   • `welcomeExtra`/`welcomeProfile` ne renvoient pas l'édition déjà envoyée,
 *     donc réexpédier la même adresse n'envoie pas un second mail ;
 *   • la réponse est la MÊME que l'adresse ait un compte ou non, pour ne pas
 *     transformer ce formulaire en détecteur de comptes.
 * Reste ouvert : rien n'empêche un script d'enfiler des adresses différentes.
 * Un plafond par IP demanderait un compteur que le projet n'a pas (rateLimit.ts
 * compte par utilisateur) — à poser le jour où l'abus se présente.
 */

const norm = (s: string) => s.trim().toLowerCase()
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  const e = norm(String(email ?? ''))
  if (!isEmail(e)) return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })

  // Un compte porte cette adresse → on bascule son réglage, pas de doublon.
  const { data: prof } = await supabaseAdmin
    .from('profiles').select('user_id').eq('email', e).maybeSingle()

  if (prof) {
    const { error } = await supabaseAdmin
      .from('profiles').update({ newsletter_optin: true }).eq('user_id', prof.user_id)
    if (error) return NextResponse.json({ error: 'Abonnement impossible.' }, { status: 500 })
    await welcomeProfile(prof.user_id as string).catch(() => {})
  } else {
    const { error } = await supabaseAdmin
      .from('newsletter_extra_emails')
      .upsert({ email: e }, { onConflict: 'email', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: 'Abonnement impossible.' }, { status: 500 })
    await welcomeExtra(e).catch(() => {})
  }

  // Volontairement identique dans les deux cas.
  return NextResponse.json({ success: true })
}
