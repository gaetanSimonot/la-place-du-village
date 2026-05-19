/**
 * Génération d'un brouillon de journal hebdo.
 *
 * Pipeline :
 *  1. Fenêtre de la semaine (lundi → dimanche)
 *  2. Curate : événements publics, annonces flagged journal, bons plans actifs,
 *     featured_slots type journal_hebdo, spotlight établissement aléatoire,
 *     article validé en attente.
 *  3. Appel Claude Sonnet 4.5 pour rédiger : kicker, titre, deck, billet, anecdote
 *  4. Insère un brouillon dans journaux_hebdo.
 *
 * Coût estimé : ~$0.05 par numéro (Sonnet, 5K input + 2K output).
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAllUsers } from '@/lib/server-auth'

const SONNET_MODEL = 'claude-sonnet-4-6'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface EvtRow {
  id: string
  titre: string
  date_debut: string | null
  heure: string | null
  description: string | null
  categorie: string | null
  lieux: { nom: string | null; commune: string | null } | null
}

interface AnnonceRow {
  id: string
  titre: string
  description: string | null
  prix_initial: number | null
  prix_actuel: number | null
  type: string
  ville: string | null
}

interface PromoRow {
  id: string
  title: string
  description: string | null
  etablissement: { nom: string | null; commune: string | null } | null
}

interface EtabRow {
  id: string
  nom: string
  commune: string | null
  type: string | null
  description_courte: string | null
}

interface ArticleRow {
  id: string
  titre: string
  corps: string
  user_id: string | null
}

interface ContextSemaine {
  semaine_du: string
  semaine_au: string
  events: EvtRow[]
  annonces: AnnonceRow[]
  promos: PromoRow[]
  spotlight: EtabRow | null
  article: ArticleRow | null
}

interface ClaudeOutput {
  cover_kicker: string
  cover_titre: string
  cover_deck: string
  billet_titre: string
  billet_corps: string
  saviez_vous: string
}

function getSemaineCourante(): { du: Date; au: Date } {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { du: monday, au: sunday }
}

async function collectContext(): Promise<ContextSemaine> {
  const { du, au } = getSemaineCourante()
  const duISO = du.toISOString().slice(0, 10)
  const auISO = au.toISOString().slice(0, 10)
  const nowISO = new Date().toISOString()

  // 1. Featured slots journal_hebdo en priorité (admin pin éditorial)
  const { data: featuredSlots } = await supabaseAdmin
    .from('featured_slots')
    .select('content_type, content_id')
    .eq('slot', 'journal_hebdo')
    .lte('starts_at', nowISO)
    .gt('ends_at', nowISO)

  const pinEvtIds   = (featuredSlots ?? []).filter(s => s.content_type === 'evenement').map(s => s.content_id)
  const pinAnnIds   = (featuredSlots ?? []).filter(s => s.content_type === 'annonce').map(s => s.content_id)
  const pinPromoIds = (featuredSlots ?? []).filter(s => s.content_type === 'promotion').map(s => s.content_id)
  const pinEtabIds  = (featuredSlots ?? []).filter(s => s.content_type === 'etablissement').map(s => s.content_id)

  // 2. Événements de la semaine (pin first, puis le reste)
  const [{ data: pinEvents }, { data: weekEvents }] = await Promise.all([
    pinEvtIds.length > 0
      ? supabaseAdmin.from('evenements').select('id, titre, date_debut, heure, description, categorie, lieux(nom, commune)').in('id', pinEvtIds).eq('statut', 'publie')
      : Promise.resolve({ data: [] as EvtRow[] }),
    supabaseAdmin.from('evenements').select('id, titre, date_debut, heure, description, categorie, lieux(nom, commune)').eq('statut', 'publie').gte('date_debut', duISO).lte('date_debut', auISO).limit(12),
  ])
  const events = mergeUnique<EvtRow>([(pinEvents ?? []) as unknown as EvtRow[], (weekEvents ?? []) as unknown as EvtRow[]]).slice(0, 8)

  // 3. Annonces : flag publier_dans_journal + pin éditorial
  const [{ data: flagged }, { data: pinAnns }] = await Promise.all([
    supabaseAdmin.from('annonces').select('id, titre, description, prix_initial, prix_actuel, type, ville').eq('statut', 'active').eq('publier_dans_journal', true).gte('created_at', duISO).limit(8),
    pinAnnIds.length > 0
      ? supabaseAdmin.from('annonces').select('id, titre, description, prix_initial, prix_actuel, type, ville').in('id', pinAnnIds)
      : Promise.resolve({ data: [] as AnnonceRow[] }),
  ])
  const annonces = mergeUnique<AnnonceRow>([(pinAnns ?? []) as AnnonceRow[], (flagged ?? []) as AnnonceRow[]]).slice(0, 6)

  // 4. Promos actives (priorité pin)
  const promosRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/promotions`).catch(() => null)
  const allPromos = (promosRes && promosRes.ok) ? ((await promosRes.json())?.promotions ?? []) as PromoRow[] : []
  const pinPromos = allPromos.filter(p => pinPromoIds.includes(p.id))
  const promos = mergeUnique<PromoRow>([pinPromos, allPromos]).slice(0, 5)

  // 5. Spotlight : pin etab > random RPC
  let spotlight: EtabRow | null = null
  if (pinEtabIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('etablissements')
      .select('id, nom, commune, type, description_courte')
      .in('id', pinEtabIds)
      .limit(1)
      .maybeSingle()
    spotlight = (data as EtabRow | null) ?? null
  }
  if (!spotlight) {
    const { data } = await supabaseAdmin.rpc('spotlight_etablissement_random')
    spotlight = Array.isArray(data) && data[0] ? (data[0] as EtabRow) : null
  }

  // 6. Article validé en attente (oldest first → file FIFO)
  const { data: articleData } = await supabaseAdmin
    .from('articles_journal')
    .select('id, titre, corps, user_id')
    .eq('statut', 'valide')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const article = (articleData as ArticleRow | null) ?? null

  return {
    semaine_du: duISO,
    semaine_au: auISO,
    events,
    annonces,
    promos,
    spotlight,
    article,
  }
}

function mergeUnique<T extends { id: string }>(arrs: T[][]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const arr of arrs) for (const x of arr) {
    if (seen.has(x.id)) continue
    seen.add(x.id); out.push(x)
  }
  return out
}

function buildPrompt(ctx: ContextSemaine): { system: string; user: string } {
  const system = `Tu rédiges Le Journal du Village, un hebdomadaire local de la région de Ganges (Sud Cévennes, Hérault) qui paraît chaque lundi. Tu écris dans un ton chaleureux, vivant, ancré dans le terroir cévenol, avec une touche éditoriale (un peu littéraire mais accessible). Pas de jargon corporate, pas de superlatifs creux. Reste précis sur les faits que tu reçois en contexte — n'invente PAS d'événements, d'établissements ou d'anecdotes : tu peux extrapoler sur l'atmosphère mais pas inventer de faits vérifiables.

Tu dois retourner STRICTEMENT du JSON valide avec ces clés (et rien d'autre, pas de markdown autour) :
{
  "cover_kicker": "string court tout en majuscules, ex: 'À LA UNE CETTE SEMAINE' ou 'AGENDA DU VILLAGE' (max 4 mots)",
  "cover_titre":  "phrase d'accroche de la une, 6-12 mots, sans point final, accrocheur",
  "cover_deck":   "chapeau 2-3 phrases (50-90 mots), italique, qui plante la semaine",
  "billet_titre": "titre du billet d'humeur, court, évocateur (4-8 mots)",
  "billet_corps": "200-280 mots, 2-3 paragraphes séparés par double saut de ligne, ton chaleureux, ancré local",
  "saviez_vous":  "anecdote/fait local en 1-2 phrases (40-70 mots), surprenant, vrai ou plausible historiquement pour les Cévennes"
}`

  const eventsBlock = ctx.events.length === 0
    ? '(aucun événement marquant cette semaine)'
    : ctx.events.map(e => `  - ${e.date_debut ?? '?'} ${e.heure ?? ''} · ${e.titre}${e.lieux?.nom ? ` @ ${e.lieux.nom}` : ''}${e.lieux?.commune ? ` (${e.lieux.commune})` : ''}${e.categorie ? ` [${e.categorie}]` : ''}`).join('\n')

  const annoncesBlock = ctx.annonces.length === 0
    ? '(aucune annonce mise en avant)'
    : ctx.annonces.map(a => `  - ${a.titre} (${a.type}, ${a.prix_actuel ?? a.prix_initial ?? '?'}€)${a.ville ? ` à ${a.ville}` : ''}`).join('\n')

  const promosBlock = ctx.promos.length === 0
    ? '(aucun bon plan actif)'
    : ctx.promos.map(p => `  - ${p.title}${p.etablissement?.nom ? ` chez ${p.etablissement.nom}` : ''}${p.etablissement?.commune ? ` (${p.etablissement.commune})` : ''}`).join('\n')

  const spotlightBlock = ctx.spotlight
    ? `${ctx.spotlight.nom} (${ctx.spotlight.type ?? 'établissement'})${ctx.spotlight.commune ? ` à ${ctx.spotlight.commune}` : ''}${ctx.spotlight.description_courte ? ` — ${ctx.spotlight.description_courte}` : ''}`
    : '(aucun)'

  const articleBlock = ctx.article
    ? `Titre : ${ctx.article.titre}\nExtrait : ${ctx.article.corps.slice(0, 200)}…`
    : '(aucun article cette semaine)'

  const user = `Rédige le numéro de la semaine du ${ctx.semaine_du} au ${ctx.semaine_au}.

ÉVÉNEMENTS DE LA SEMAINE :
${eventsBlock}

PETITES ANNONCES MISES EN AVANT :
${annoncesBlock}

BONS PLANS DES COMMERÇANTS :
${promosBlock}

COUP DE PROJECTEUR — ÉTABLISSEMENT DU VILLAGE :
${spotlightBlock}

ARTICLE PROPOSÉ PAR UN HABITANT :
${articleBlock}

À toi. JSON strict uniquement, pas de bavardage.`

  return { system, user }
}

async function callClaude(system: string, user: string): Promise<ClaudeOutput> {
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean) as ClaudeOutput
}

export async function generateJournalDraft(): Promise<{ id: string; numero: number }> {
  const ctx = await collectContext()
  const { system, user } = buildPrompt(ctx)
  const ai = await callClaude(system, user)

  const { du } = getSemaineCourante()

  const { data: last } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  const numero = (last?.numero ?? 0) + 1

  const nowISO = new Date().toISOString()
  const insert = {
    numero,
    date_parution:        du.toISOString().slice(0, 10),
    semaine_du:           ctx.semaine_du,
    semaine_au:           ctx.semaine_au,
    cover_kicker:         ai.cover_kicker,
    cover_titre:          ai.cover_titre,
    cover_deck:           ai.cover_deck,
    billet_titre:         ai.billet_titre,
    billet_corps:         ai.billet_corps,
    saviez_vous:          ai.saviez_vous,
    selection_event_ids:  ctx.events.map(e => e.id),
    selection_annonce_ids: ctx.annonces.map(a => a.id),
    selection_bonplan_ids: ctx.promos.map(p => p.id),
    selection_article_id: ctx.article?.id ?? null,
    spotlight_etab_id:    ctx.spotlight?.id ?? null,
    spotlight_kind:       'etablissement' as const,
    temps_lecture_min:    5,
    // Auto-publication : seul l'humain (article) demande validation ;
    // l'agrégat hebdo ne contient que des entités déjà publiées → safe à publier.
    statut:               'publie',
    publie_at:            nowISO,
  }

  const { data, error } = await supabaseAdmin
    .from('journaux_hebdo')
    .insert(insert)
    .select('id, numero')
    .single()

  if (error) throw new Error(`Insert journal: ${error.message}`)

  // Si un article était attaché au numéro, on le passe en 'publie' + lien
  if (ctx.article?.id) {
    await supabaseAdmin
      .from('articles_journal')
      .update({ statut: 'publie', journal_id: data.id })
      .eq('id', ctx.article.id)
  }

  // Notif broadcast à tous les users (fail-silent)
  await notifyAllUsers({
    type:        'journal_publie',
    actor_name:  'Le Journal du Village',
    target_type: 'journal',
    target_id:   data.id,
  })

  return { id: data.id, numero: data.numero }
}
