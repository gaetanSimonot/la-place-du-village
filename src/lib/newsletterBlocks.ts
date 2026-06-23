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
  | { id: string; type: 'partenaires'; titre: string; ids: string[] }   // "etab:<id>" | "prod:<id>"

export type BlockType = NewsletterBlock['type']

/** Item normalisé renvoyé par les blocs "contenu" (commun aperçu + email). */
export interface ContentItem {
  title: string
  sub: string | null
  image: string | null
  href: string
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
    case 'partenaires': return { id, type, titre: 'Nos coups de cœur', ids: [] }
  }
}

/** Blocs de départ pour une nouvelle newsletter. */
export function starterBlocks(): NewsletterBlock[] {
  return [
    makeBlock('header'),
    makeBlock('text'),
    makeBlock('events'),
  ]
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
  partenaires: 'Coups de cœur partenaires',
}
