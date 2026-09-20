import Anthropic from '@anthropic-ai/sdk'
import { safeJsonParse } from './safeJsonParse'
import { CATEGORIES } from './categories'
import type { Categorie } from './types'

/**
 * LES DEUX SEULS ENDROITS OÙ UN MODÈLE INTERVIENT DANS LE SCRAPE STRUCTURÉ.
 *
 * Le reste du chemin ne fait que lire : chaque champ vient d'un champ que le
 * site publie. Ces deux retouches-là existent parce que la source, elle, ne
 * dit pas tout de la même façon que nous.
 *
 * Elles sont regroupées ici pour qu'on puisse répondre d'un coup d'œil à la
 * question « où est-ce qu'on interprète ? ». La réponse est : ici, et nulle
 * part ailleurs.
 *
 * Toutes deux échouent en silence et rendent l'original : une retouche ratée
 * ne doit jamais coûter un événement.
 */

const MODELE = 'claude-haiku-4-5-20251001'

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// ── 1. Ranger ce que la source n'a pas rangé ─────────────────────────────────

/**
 * Range les événements tombés dans le fourre-tout de la source.
 *
 * Alentoor possède une rubrique « activités-loisirs » où il met aussi bien le
 * Top 14 qu'un atelier fromage : la traduire fidèlement donnerait « autre »
 * pour un tiers de l'agenda, alors que le TITRE dit tout haut « Rugby Top14 —
 * Section Vs Castres ».
 *
 * Lire ce titre n'est pas inventer : l'information est écrite, elle est juste
 * ailleurs que dans la rubrique. On ne le fait QUE pour ce fourre-tout —
 * partout ailleurs la source a dit sa rubrique, et sa parole prime.
 */
export async function rangerLeFourreTout(
  lignes: { id: string; titre: string; description: string | null }[],
): Promise<Record<string, Categorie>> {
  const anthropic = client()
  if (!anthropic || !lignes.length) return {}
  const valides = Object.keys(CATEGORIES) as Categorie[]
  try {
    const r = await anthropic.messages.create({
      model: MODELE, max_tokens: 2048, temperature: 0,
      system: 'Tu ranges des événements locaux dans des catégories. '
        + 'Catégories autorisées, et AUCUNE autre : ' + valides.join(', ') + '. '
        + 'Réponds UNIQUEMENT par un tableau JSON [{"i":<numéro>,"c":"<catégorie>"}], '
        + 'un objet par événement, dans l’ordre reçu. '
        + 'Si le titre ne permet pas de trancher, réponds "autre" — ne devine pas.',
      messages: [{
        role: 'user',
        content: lignes.map((l, i) =>
          i + '. ' + l.titre + (l.description ? ' — ' + l.description.slice(0, 160) : ''),
        ).join('\n'),
      }],
    })
    const brut = r.content[0].type === 'text' ? r.content[0].text : '[]'
    const parsed = safeJsonParse<{ i: number; c: string }[]>(brut)
    if (!Array.isArray(parsed)) return {}
    const out: Record<string, Categorie> = {}
    for (const x of parsed) {
      const ligne = lignes[x?.i]
      const cat = String(x?.c ?? '') as Categorie
      if (ligne && valides.indexOf(cat) >= 0 && cat !== 'autre') out[ligne.id] = cat
    }
    return out
  } catch {
    return {}
  }
}

// ── 2. Mettre les descriptions au format de la maison ────────────────────────

/** Au-delà, une description n'est plus une accroche : c'est un dossier. */
const TROP_LONG = 260

/** Taille d'un lot : assez pour ne pas multiplier les appels, assez court pour tenir. */
const LOT = 15

/**
 * Une description a-t-elle besoin d'être reprise ?
 *
 * Deux cas, et le second compte autant que le premier. Trop longue : elle ne
 * ressemble plus à celles des collecteurs, qui font deux à trois lignes.
 * COUPÉE EN PLEIN MOT : les données structurées des agendas plafonnent à 500
 * caractères et tranchent où ça tombe — « …le palais est habité par la Hoch
 * Kommandatur.... ». Laisser ça sur une fiche, c'est signer un travail bâclé.
 */
export function aBesoinDeReprise(d: string | null | undefined): boolean {
  const t = (d ?? '').trim()
  if (!t) return false
  if (t.length > TROP_LONG) return true
  return /[a-zà-ÿ,]\s*\.{3,}$|\S…$/.test(t)
}

/**
 * Réécrit des descriptions au format de la maison : deux à trois phrases.
 *
 * C'EST UNE RÉÉCRITURE, PAS UNE INVENTION. Le modèle n'a le droit qu'à ce
 * qu'il lit : pas un horaire, pas un prix, pas un nom qui ne soit déjà dans
 * le texte. Quand la source s'arrête en plein mot, il termine la phrase
 * commencée sans imaginer la suite — et si la fin est incompréhensible, il
 * la laisse tomber plutôt que de la deviner.
 *
 * Pourquoi cette retouche existe : un événement saisi par un habitant passe
 * déjà par ce traitement, côté collecteurs. Sans elle, les fiches scrapées
 * jureraient à côté — quatre cents caractères bruts contre trois lignes
 * écrites. Mesuré le 20/09/2026 : 452 caractères de médiane côté scrape
 * contre 118 à 161 pour les collecteurs et le formulaire.
 *
 * Rend un dictionnaire id → nouvelle description. Une ligne absente du
 * résultat garde la sienne.
 */
export async function reformulerDescriptions(
  lignes: { id: string; titre: string; description: string }[],
): Promise<Record<string, string>> {
  const anthropic = client()
  if (!anthropic || !lignes.length) return {}
  const out: Record<string, string> = {}

  for (let d = 0; d < lignes.length; d += LOT) {
    const lot = lignes.slice(d, d + LOT)
    try {
      const r = await anthropic.messages.create({
        model: MODELE, max_tokens: 4096, temperature: 0,
        system: 'Tu réécris des descriptions d’événements locaux pour une application de village. '
          + 'DEUX À TROIS PHRASES, 300 caractères maximum, ton neutre et concret, en français. '
          + 'INTERDIT ABSOLU : ajouter un fait qui ne figure pas dans le texte reçu — '
          + 'pas d’horaire, pas de prix, pas de lieu, pas de nom inventé. '
          + 'Le texte reçu peut être coupé en plein mot : termine alors la phrase commencée '
          + 'si son sens est clair, sinon supprime ce fragment. Ne commence pas par le titre. '
          + 'Réponds UNIQUEMENT par un tableau JSON [{"i":<numéro>,"d":"<description>"}].',
        messages: [{
          role: 'user',
          content: lot.map((l, i) =>
            i + '. TITRE: ' + l.titre + '\nTEXTE: ' + l.description.replace(/\s+/g, ' '),
          ).join('\n\n'),
        }],
      })
      const brut = r.content[0].type === 'text' ? r.content[0].text : '[]'
      const parsed = safeJsonParse<{ i: number; d: string }[]>(brut)
      if (!Array.isArray(parsed)) continue
      for (const x of parsed) {
        const ligne = lot[x?.i]
        const texte = String(x?.d ?? '').trim()
        // Une réécriture plus longue que l'original n'en est pas une : c'est
        // du remplissage. On garde alors le texte de la source.
        if (ligne && texte.length >= 20 && texte.length <= ligne.description.length) {
          out[ligne.id] = texte
        }
      }
    } catch {
      // Le lot garde ses descriptions d'origine. On continue les suivants.
    }
  }
  return out
}
