import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'
import { getPrompt } from './prompts-ia'
import { safeJsonParse } from './safeJsonParse'
import { memeCommune } from './communes'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface DoublonCheckInput {
  titre: string
  date_debut: string | null
  /** Facultative : deux seances du meme spectacle le meme jour se distinguent
   *  par elle, et c'est ce qui evite de prendre la seconde pour un doublon. */
  heure?: string | null
  commune: string | null
  lieu_nom: string | null
  description: string | null
}

export interface DoublonCheckResult {
  doublon: boolean
  doublon_id: string | null
  publier: boolean
  raison: string
  infos_manquantes: string[]
}

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Un texte ramené à ce qui l'identifie : sans accents, sans ponctuation,
 * sans casse. « Saint-Bauzille-de-Putois » et « St Bauzille de Putois »
 * doivent se reconnaître — la base porte NEUF communes écrites de plusieurs
 * façons, et la comparaison stricte les tenait pour des endroits différents.
 */
function cleTexte(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .trim()
}

/**
 * Deux communes désignent-elles le même endroit ?
 *
 * Une commune ABSENTE est compatible avec tout : c'est le point qui laissait
 * passer les doublons. L'ancien filtre comparait `commune === commune`, si
 * bien qu'un événement sans lieu résolu — commune vide — ne correspondait à
 * rien et n'était JAMAIS comparé. Mesuré : 27 des 37 copies en trop de
 * l'agenda venaient de là.
 */
function communesCompatibles(a: string | null | undefined, b: string | null | undefined): boolean {
  // `memeCommune` porte la meme normalisation que la fusion des graphies :
  // « St Hippolyte du Fort » et « Saint-Hippolyte-du-Fort » sont le meme
  // village pour la detection de doublons comme pour l'affichage.
  return memeCommune(a, b)
}

/** L'heure, ramenée à HH:MM — la base écrit tantôt « 20:00 », tantôt « 20:00:00 ». */
const cleHeure = (h: string | null | undefined): string => (h ?? '').slice(0, 5)

export async function checkDoublon(newEvent: DoublonCheckInput): Promise<DoublonCheckResult> {
  const safe: DoublonCheckResult = {
    doublon: false, doublon_id: null, publier: true,
    raison: 'Aucun candidat à comparer', infos_manquantes: [],
  }

  // Pas de commune ni de date → on ne peut pas comparer, on accepte
  if (!newEvent.commune && !newEvent.date_debut) return safe

  // Fetch events récents de la même commune ±7 jours
  let query = supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, description, heure, lieux(nom, commune)')
    .not('statut', 'in', '("archive","rejete")')
    .order('created_at', { ascending: false })
    /*
     * 300 ET NON 60.
     *
     * La requete est deja bornee aux fiches dont la date tombe a sept jours
     * de celle du nouvel evenement ; le plafond ne servait qu'a se proteger.
     * A 60, il coupait pour de vrai : « Cafe Pros La Soierie », saisi deux
     * semaines plus tot, etait sorti de la fenetre et son doublon est passe.
     * Mesure le 15/09/2026.
     */
    .limit(300)

  if (newEvent.date_debut) {
    const d = new Date(newEvent.date_debut + 'T00:00:00')
    const from = formatDateOnly(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
    const to   = formatDateOnly(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
    query = query.gte('date_debut', from).lte('date_debut', to)
  }

  const { data } = await query
  const compatibles = (data ?? [])
    .filter(e => communesCompatibles((e.lieux as { commune?: string } | null)?.commune, newEvent.commune))

  if (compatibles.length === 0) return safe

  // Le modele ne lit que dix fiches — au-dela, il confond. Le test
  // deterministe ci-dessous, lui, les regarde TOUTES : il ne coute rien et un
  // jumeau evident ne doit pas dependre de la place qu'il occupe dans la pile.
  const candidates = compatibles.slice(0, 10)

  /*
   * LE CAS ÉVIDENT, TRANCHÉ SANS DEMANDER À PERSONNE.
   *
   * Même titre, même jour, même heure, et des communes qui ne se contredisent
   * pas : c'est le même événement, il n'y a rien à interpréter. Jusqu'ici tout
   * passait par Claude, qui ne voyait que dix candidats et se faisait berner
   * par une commune écrite autrement — « Yoga aérien » figurait DIX fois au
   * 1er octobre, « Cabaret queer » six fois au 30 septembre.
   *
   * Ce test est aussi une économie : le cas le plus fréquent ne coûte plus
   * d'appel au modèle.
   */
  const kTitre = cleTexte(newEvent.titre)
  const kHeure = cleHeure(newEvent.heure)
  if (kTitre && newEvent.date_debut) {
    const jumeau = compatibles.find(e =>
      cleTexte(e.titre) === kTitre
      && e.date_debut === newEvent.date_debut
      && cleHeure(e.heure) === kHeure,
    )
    if (jumeau) {
      return {
        doublon: true,
        doublon_id: jumeau.id,
        publier: false,
        raison: 'Déjà présent — même titre, même date, même heure',
        infos_manquantes: [],
      }
    }
  }

  // Appel Claude Haiku avec timeout 7s (Vercel Hobby = 10s max)
  let response
  try {
    const systemPrompt = await getPrompt('doublon_check')
    const claudeCall = anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      temperature: 0,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Nouvel événement :
${JSON.stringify({ titre: newEvent.titre, date: newEvent.date_debut, commune: newEvent.commune, lieu: newEvent.lieu_nom, description: newEvent.description?.slice(0, 200) })}

Événements existants dans la même zone/période :
${JSON.stringify(candidates.map(e => ({ id: e.id, titre: e.titre, date: e.date_debut })))}`,
      }],
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 7000)
    )
    response = await Promise.race([claudeCall, timeout])
  } catch {
    // Timeout ou erreur Claude → a_verifier (prudent)
    return { doublon: false, doublon_id: null, publier: false, raison: 'Vérification indisponible — à vérifier manuellement', infos_manquantes: [] }
  }

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const result = safeJsonParse<DoublonCheckResult & { doublon?: unknown; doublon_id?: unknown; publier?: unknown; raison?: unknown; infos_manquantes?: unknown }>(raw)
  if (!result) {
    return { ...safe, raison: 'Réponse Claude non parseable — accepté par défaut' }
  }
  return {
    doublon:          !!result.doublon,
    doublon_id:       (result.doublon_id as string | null) ?? null,
    publier:          result.doublon ? false : ((result.publier as boolean | undefined) ?? true),
    raison:           (result.raison as string | undefined) ?? '',
    infos_manquantes: Array.isArray(result.infos_manquantes) ? result.infos_manquantes : [],
  }
}
