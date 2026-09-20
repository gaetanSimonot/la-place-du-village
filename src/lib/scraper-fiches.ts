import Anthropic from '@anthropic-ai/sdk'
import { safeJsonParse } from './safeJsonParse'
import { evenementsStructures, type EventStructure } from './schemaOrg'
import { liensDeFiches, metaOpenGraph } from './sourceDecouverte'

/**
 * QUAND LA PAGE DE LISTE NE PUBLIE RIEN, ON VA VOIR LES FICHES.
 *
 * L'ancien repli aplatissait toute la page en texte et faisait chercher les
 * événements dedans par un modèle. Ça marche, mais l'aplatissement EFFACE LES
 * IMAGES : les fiches naissaient nues, et c'était le cas de la majorité des
 * sites, puisque schema.org reste minoritaire.
 *
 * Ici on suit les liens vers chaque fiche, et on prend sur place :
 *
 *   — ses données structurées, si elle en a (beaucoup de sites n'en mettent
 *     pas sur la liste mais en posent sur chaque page) ;
 *   — sinon ses balises OPEN GRAPH, que presque tout le monde porte sans le
 *     savoir — c'est ce qui fabrique l'aperçu quand on colle un lien dans une
 *     messagerie. Titre, résumé, ET IMAGE.
 *
 * Reste ce qu'Open Graph ne dit jamais : LA DATE. C'est le seul endroit où un
 * modèle intervient, et il travaille sur le texte d'une fiche — quelques
 * lignes — et non sur quarante mille caractères de page de liste. Un appel
 * pour une quinzaine de fiches.
 *
 * Ce module ne fait que COLLECTER. Il rend exactement la même forme que la
 * lecture structurée, et c'est le pipeline habituel qui écrit — dédoublonnage,
 * géocodage, réutilisation des lieux, rapatriement des images, publication.
 */

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

/** Fiches lues de front : de l'attente réseau, rien de plus. */
const LOT = 5
/** Au-delà, on moissonne un site entier — une page de liste n'en montre jamais tant. */
const FICHES_MAX = 60
/** Fiches soumises au modèle en une fois, pour retrouver leurs dates. */
const LOT_DATES = 15

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

async function lire(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), 10_000)
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: ctrl.signal })
    clearTimeout(minuteur)
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

/** Le texte visible d'une fiche, borné : une fiche tient en quelques lignes. */
function texteVisible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}

interface DatesLues {
  startDate?: string | null
  endDate?: string | null
  lieu?: string | null
  commune?: string | null
  adresse?: string | null
}

/**
 * Retrouve les dates que les balises ne disent pas.
 *
 * Le modèle ne voit QUE le texte de la fiche, et n'a le droit de rendre que
 * des champs qu'il y lit. Une fiche sans date reste sans date : c'est la règle
 * de la maison, on n'invente aucune date. Elle sera écartée plus loin, ce qui
 * vaut mieux qu'une date imaginée.
 */
async function retrouverLesDates(
  fiches: { url: string; titre: string; texte: string }[],
  aujourdhui: string,
): Promise<Record<string, DatesLues>> {
  if (!fiches.length || !process.env.ANTHROPIC_API_KEY) return {}
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const out: Record<string, DatesLues> = {}

  for (let d = 0; d < fiches.length; d += LOT_DATES) {
    const lot = fiches.slice(d, d + LOT_DATES)
    try {
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096, temperature: 0,
        system: 'Tu lis des fiches d’événements locaux français et tu en extrais UNIQUEMENT '
          + 'ce qui y est écrit. Aujourd’hui : ' + aujourdhui + '. '
          + 'Pour chaque fiche, rends : startDate et endDate au format AAAA-MM-JJ '
          + '(ajoute THH:MM quand une heure de début est donnée), lieu (nom de la salle), '
          + 'commune, adresse. '
          + 'N’INVENTE RIEN : un champ absent du texte vaut null, et une fiche sans date '
          + 'doit avoir startDate null. Ne déduis pas une année que le texte ne donne pas '
          + 'si elle est ambiguë — prends l’occurrence à venir la plus proche. '
          + 'Réponds UNIQUEMENT par un tableau JSON '
          + '[{"i":<numéro>,"startDate":...,"endDate":...,"lieu":...,"commune":...,"adresse":...}].',
        messages: [{
          role: 'user',
          content: lot.map((f, i) => i + '. TITRE: ' + f.titre + '\nTEXTE: ' + f.texte).join('\n\n'),
        }],
      })
      const brut = r.content[0].type === 'text' ? r.content[0].text : '[]'
      const parsed = safeJsonParse<(DatesLues & { i: number })[]>(brut)
      if (!Array.isArray(parsed)) continue
      for (const x of parsed) {
        const f = lot[x?.i]
        if (f) out[f.url] = x
      }
    } catch {
      // Ce lot garde ses fiches sans date : elles seront écartées, pas devinées.
    }
  }
  return out
}

/**
 * Collecte les événements d'une page de liste en visitant ses fiches.
 *
 * Rend la même forme que la lecture structurée, pour que la suite du pipeline
 * ne fasse aucune différence entre les deux origines.
 */
export async function collecterParFiches(
  pageListe: string,
  budgetMs = 120_000,
  quota = FICHES_MAX,
): Promise<{
  fiches: Record<string, EventStructure>
  visitees: number
  parOpenGraph: number
  /** Le HTML de chaque fiche, pour ne pas la retelecharger ensuite. */
  pages: Record<string, string>
}> {
  const out: Record<string, EventStructure> = {}
  const pagesLues: Record<string, string> = {}
  const resultat = { fiches: out, visitees: 0, parOpenGraph: 0, pages: pagesLues }

  const liste = await lire(pageListe)
  if (!liste) return resultat
  const urls = liensDeFiches(liste, pageListe).slice(0, Math.max(0, Math.min(FICHES_MAX, quota)))
  if (!urls.length) return resultat

  const aujourdhui = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  const sansDate: { url: string; titre: string; texte: string }[] = []
  const fini = Date.now() + budgetMs

  for (let d = 0; d < urls.length; d += LOT) {
    if (Date.now() > fini) break
    const lot = urls.slice(d, d + LOT)
    const pages = await Promise.all(lot.map(u => lire(u)))
    resultat.visitees += lot.length
    await pause(150)

    for (let k = 0; k < lot.length; k++) {
      const html = pages[k]
      if (!html) continue
      const url = lot[k]
      pagesLues[url] = html

      // 1. La fiche publie-t-elle ses données ? Alors rien à interpréter.
      const structure = evenementsStructures(html)[0]
      if (structure && structure.startDate) { out[url] = { ...structure, url }; continue }

      // 2. Sinon Open Graph — le titre, le résumé, et surtout l'image.
      const og = metaOpenGraph(html)
      const titre = (structure?.name ?? og.titre ?? '').trim()
      if (!titre) continue
      out[url] = {
        '@type': 'Event',
        name: titre,
        url,
        description: structure?.description ?? og.description ?? null,
        image: structure?.image ?? (og.image ? [og.image] : null),
        location: structure?.location ?? null,
        startDate: structure?.startDate ?? null,
        endDate: structure?.endDate ?? null,
      }
      if (og.image) resultat.parOpenGraph++
      if (!out[url].startDate) sansDate.push({ url, titre, texte: texteVisible(html) })
    }
  }

  // 3. Les dates, pour celles qui n'en portaient pas.
  const dates = await retrouverLesDates(sansDate, aujourdhui)
  for (const url of Object.keys(dates)) {
    const d = dates[url]
    const e = out[url]
    if (!e || !d?.startDate) continue
    e.startDate = d.startDate
    e.endDate = d.endDate ?? null
    if (!e.location && (d.lieu || d.commune || d.adresse)) {
      e.location = {
        name: d.lieu ?? null,
        address: {
          streetAddress: d.adresse ?? null,
          addressLocality: d.commune ?? null,
          postalCode: null,
        },
      }
    }
  }

  // Une fiche sans date n'est pas un événement : on ne la garde pas.
  for (const url of Object.keys(out)) if (!out[url].startDate) delete out[url]
  return resultat
}
