import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from '@/lib/prompts-ia'
import { safeJsonParse } from '@/lib/safeJsonParse'
import { communesDesservies, resoudreCommune } from '@/lib/transportRecherche'
import { requireUser } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/transport/dictee { texte }
 *
 * Transforme une phrase dictee — « je voudrais aller a Montpellier demain
 * matin depuis Ganges » — en une recherche : depart, arrivee, jour, heure.
 *
 * LE MODELE INTERPRETE, LE SERVEUR VALIDE. On lui donne la liste exacte des
 * communes desservies, et on repasse SA reponse dans `resoudreCommune` : s'il
 * invente « Montpellier-Nord », rien ne sort. Une commune inventee donnerait
 * des horaires parfaitement exacts pour un trajet que personne n'a demande —
 * l'erreur la plus difficile a reperer.
 *
 * Ce qui manque n'est pas devine : sans commune de depart, on renvoie le
 * champ vide et l'interface laisse la personne le completer.
 *
 * Le prompt est cherche en base (`transport_dictee`) pour rester corrigeable
 * depuis /admin, avec un repli ecrit ici : la dictee doit marcher meme si la
 * ligne n'a pas ete creee.
 */

const PROMPT_DEFAUT = `Tu extrais une recherche d'horaires de car a partir d'une phrase dictee.

Reponds UNIQUEMENT par un objet JSON, sans texte autour :
{"depart": "...", "arrivee": "...", "date": "AAAA-MM-JJ", "heure": "HH:MM"}

Regles :
- "depart" et "arrivee" doivent etre choisis DANS LA LISTE des communes fournie. Si tu n'es pas sur, mets null. N'invente jamais une commune.
- Les mots "de", "depuis", "du" annoncent le depart ; "a", "vers", "pour", "jusqu'a" annoncent l'arrivee.
- "date" : aujourd'hui par defaut. "demain" = le lendemain, "apres-demain" = le surlendemain. Un jour de la semaine nomme designe le PROCHAIN.
- "heure" : plancher de la recherche. "le matin" = 07:00, "midi" = 12:00, "l'apres-midi" = 14:00, "le soir" = 18:00, "maintenant" ou rien = l'heure donnee.
- Ce qui n'est pas dit vaut null.`

function jour(base: Date, decalage: number): string {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + decalage)
  return d.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  // Compte requis, comme pour tout appel payant du projet. Sans ça, cette
  // route appellerait Claude pour n'importe qui, sans compteur.
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // Quota propre au transport : 5 par jour sans abonnement, 20 pour les
  // abonnés, illimité pour les administrateurs. À la journée et non à
  // l'heure : chercher un car est un geste du quotidien, pas une rafale.
  const bloque = await rateLimit(ctx.userId, 'transport_dictee', ctx.plan, ctx.isAdmin)
  if (bloque) return bloque

  const { texte } = await req.json().catch(() => ({}))
  if (typeof texte !== 'string' || texte.trim().length < 3) {
    return NextResponse.json({ error: 'Rien à interpréter' }, { status: 400 })
  }

  // Aujourd'hui vu de Paris — le serveur Vercel tourne en UTC.
  const aujourdhui = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const maintenant = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace('h', ':')

  const communes = await communesDesservies()

  let systeme = PROMPT_DEFAUT
  try { systeme = await getPrompt('transport_dictee') } catch { /* repli ci-dessus */ }

  let brut = '{}'
  try {
    const rep = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      system: systeme,
      messages: [{
        role: 'user',
        content:
          `Communes desservies : ${communes.join(', ')}\n` +
          `Aujourd'hui : ${aujourdhui}. Heure : ${maintenant}.\n\n` +
          `Phrase : ${texte.slice(0, 400)}`,
      }],
    })
    brut = rep.content[0].type === 'text' ? rep.content[0].text : '{}'
  } catch {
    return NextResponse.json({ error: 'Interprétation indisponible' }, { status: 502 })
  }

  const lu = safeJsonParse<Record<string, unknown>>(brut) ?? {}

  // On repasse SES communes dans notre resolveur : il ne peut pas en inventer.
  const valider = async (v: unknown): Promise<string | null> => {
    if (typeof v !== 'string' || !v.trim()) return null
    const r = await resoudreCommune(v)
    return r.commune
  }
  const [depart, arrivee] = await Promise.all([valider(lu.depart), valider(lu.arrivee)])

  const date = typeof lu.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lu.date)
    // Jamais dans le passé : une date mal résolue sortirait « aucun car » sans
    // qu'on comprenne pourquoi.
    ? (lu.date < aujourdhui ? aujourdhui : lu.date)
    : aujourdhui

  const heure = typeof lu.heure === 'string' && /^\d{2}:\d{2}$/.test(lu.heure)
    ? lu.heure
    : (date === aujourdhui ? maintenant : '06:00')

  return NextResponse.json({
    depart, arrivee, date, heure,
    // Ce qui manque, pour que l'interface le dise plutôt que de chercher à vide.
    manquant: [!depart && 'depart', !arrivee && 'arrivee'].filter(Boolean),
    demain: jour(new Date(`${aujourdhui}T12:00:00Z`), 1),
  })
}
