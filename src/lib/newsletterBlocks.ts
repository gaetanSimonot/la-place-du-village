/**
 * Modèle de blocs de la newsletter (builder par sections).
 * Le même tableau de blocs sert : à l'éditeur (aperçu cliquable) et au rendu
 * email côté serveur (src/lib/newsletterRender.ts).
 */

export type ContentKind = 'events' | 'promos' | 'annonces' | 'journal' | 'partenaires'

/** Bloc liste (events/promos/annonces) : auto = N plus récents, manuel = choisis. */
interface ListBlockBase { titre: string; mode: 'auto' | 'manual'; count: number; ids: string[] }

export type NewsletterBlock =
  | { id: string; type: 'header'; titre: string; sousTitre: string; imageUrl?: string | null }
  | { id: string; type: 'text'; texte: string }
  | { id: string; type: 'button'; label: string; href: string }
  | { id: string; type: 'image'; url: string }
  | { id: string; type: 'separator' }
  | ({ id: string; type: 'events' } & ListBlockBase)
  | ({ id: string; type: 'promos' } & ListBlockBase)
  | ({ id: string; type: 'annonces' } & ListBlockBase)
  | { id: string; type: 'journal'; titre: string }
  /**
   * La semaine en chiffres — le compte des événements par catégorie.
   *
   * Remplace la sélection manuelle d'événements, et c'est délibéré : choisir
   * cinq événements parmi soixante, c'est se tromper cinquante-cinq fois, se
   * répéter d'une semaine sur l'autre et risquer le doublon. Un décompte ne
   * peut pas mal choisir — il dit la vérité, et il donne l'échelle.
   */
  | { id: string; type: 'semaine'; titre: string }
  /**
   * Article et coups de cœur portent un MODE, comme les blocs liste.
   *
   * Sans lui, le montage automatique écrasait le choix de l'admin à chaque
   * ouverture de l'éditeur : on choisissait deux commerçants, on revenait le
   * lendemain, c'étaient les deux calculés. Et comme l'éditeur réenregistre
   * ce qu'il affiche, le choix était détruit en base dans la foulée.
   *
   * `auto` = la semaine décide, `manual` = l'admin a tranché, on n'y touche
   * plus. Le défaut reste `auto` : ouvrir l'éditeur un lundi ne doit toujours
   * rien demander.
   */
  | { id: string; type: 'article'; titre: string; mode: 'auto' | 'manual'; ids: string[] }
  | { id: string; type: 'partenaires'; titre: string; mode: 'auto' | 'manual'; ids: string[] }

export type BlockType = NewsletterBlock['type']

/** Item normalisé renvoyé par les blocs "contenu" (commun aperçu + email). */
export interface ContentItem {
  title: string
  sub: string | null
  image: string | null
  href: string
}

/**
 * L'EMPREINTE D'UNE LETTRE — calculée des DEUX côtés, donc ici.
 *
 * Elle sert à une seule question, mais c'est la plus importante de l'écran :
 * « ce que je regarde est-il bien ce qui va partir ? ». L'éditeur calcule
 * l'empreinte de ce qu'il affiche, le serveur celle de l'édition en cours ;
 * si elles diffèrent, c'est qu'une modification n'a pas été posée.
 *
 * Volontairement simple — djb2 sur le JSON. On ne protège rien, on compare
 * deux états : une collision n'aurait pour effet que de ne pas signaler une
 * différence, et les deux côtés sérialisent le même objet.
 */
export function empreinteLettre(subject: string, blocks: NewsletterBlock[]): string {
  const texte = JSON.stringify({ s: subject ?? '', b: blocks ?? [] })
  let h = 5381
  for (let i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function genId(): string {
  try { return crypto.randomUUID() } catch { return `b${Date.now()}${Math.floor(Math.random() * 1e6)}` }
}

const SITE = 'https://laplaceduvillage.app'

/** Crée un bloc neuf avec ses valeurs par défaut. */
export function makeBlock(type: BlockType): NewsletterBlock {
  const id = genId()
  switch (type) {
    case 'header':      return { id, type, titre: 'La Place du Village', sousTitre: 'Les nouvelles de la semaine', imageUrl: null }
    case 'text':        return { id, type, texte: 'Écris ton mot ici…' }
    case 'button':      return { id, type, label: 'Découvrir', href: SITE }
    case 'image':       return { id, type, url: '' }
    case 'separator':   return { id, type }
    case 'events':      return { id, type, titre: 'À ne pas manquer', mode: 'auto', count: 4, ids: [] }
    case 'promos':      return { id, type, titre: 'Les bons plans', mode: 'auto', count: 4, ids: [] }
    case 'annonces':    return { id, type, titre: 'Dans les annonces', mode: 'auto', count: 4, ids: [] }
    case 'journal':     return { id, type, titre: 'Le Journal du Village' }
    case 'semaine':     return { id, type, titre: 'Cette semaine près de chez vous' }
    case 'article':     return { id, type, titre: 'À lire dans le Journal', mode: 'auto', ids: [] }
    case 'partenaires': return { id, type, titre: 'Nos coups de cœur', mode: 'auto', ids: [] }
  }
}

/** Blocs de départ pour une nouvelle newsletter. */
export function starterBlocks(): NewsletterBlock[] {
  return [
    makeBlock('header'),
    makeBlock('semaine'),
    makeBlock('promos'),
    makeBlock('article'),
    makeBlock('partenaires'),
  ]
}

/** Le décompte d'une catégorie, pour le bloc « semaine ». */
export interface CompteCategorie { id: string; label: string; emoji: string; couleur: string; n: number }

export interface SemaineChiffres {
  total: number
  libelle: string
  categories: CompteCategorie[]
  href: string
  /**
   * Ce que `total` n'a PAS compté : les expositions, cours et permanences
   * ouverts une semaine ou plus, qui se tiennent bien pendant la période mais
   * qu'on n'annonce pas comme un rendez-vous (cf. `getSemaineChiffres`).
   *
   * Nommé pour être affiché en toutes lettres : le chiffre de la carte les
   * inclut, celui de la lettre non, et rien ne disait où passait l'écart.
   */
  installes: number
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  header: 'En-tête',
  text: 'Texte',
  button: 'Bouton / lien',
  image: 'Image',
  separator: 'Séparateur',
  events: 'Événements à ne pas manquer',
  promos: 'Bons plans / Promos',
  annonces: 'Annonces',
  journal: 'Le Journal',
  semaine: 'La semaine en chiffres',
  article: 'Article du Journal',
  partenaires: 'Coups de cœur partenaires',
}
