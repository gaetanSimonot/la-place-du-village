import type { EmbedKind } from '@/components/EmbedPicker'

/**
 * LE HÉROS DU VILLAGE — un encart mis en avant, en tête de la page Village.
 *
 * Il sert à pousser ce qui compte en ce moment : une collecte d'entraide, un
 * débat en cours, un commerce à soutenir.
 *
 * PLUSIEURS FICHES, UN SEUL EMPLACEMENT. L'encart n'en montre qu'une à la
 * fois et passe à la suivante toute seule, comme le bandeau « à la une » de la
 * carte. Ce n'est pas une file d'attente qu'on allonge sans fin : au-delà de
 * trois ou quatre, plus rien ne se détache et l'encart perd ce qui fait sa
 * valeur. Une seule fiche reste le cas courant — elle ne défile pas.
 *
 * Il vit dans `config('village_hero')`, comme les autres réglages de la page
 * d'accueil, et s'édite dans /admin/hub-carousel.
 *
 * TROIS PUBLICS, pas un interrupteur. « masque » le retire à tout le monde ;
 * « admin » ne le montre qu'aux comptes admin — c'est la position de rodage,
 * celle où l'on vérifie le rendu sur son propre téléphone sans rien exposer ;
 * « tous » l'ouvre au village. Le serveur tranche : masquer côté client
 * laisserait le contenu dans la réponse.
 *
 * Mêmes trois valeurs que la visibilité du cinéma et de l'assistant — c'est
 * délibéré : un seul vocabulaire de visibilité dans toute l'application.
 */
export type PublicHeros = 'tous' | 'admin' | 'masque'

/** Ce que le héros met en avant : une fiche de l'app, ou un lien du dehors. */
export type CibleHeros =
  | { sorte: 'interne'; kind: EmbedKind; id: string }
  | { sorte: 'lien';    url: string }

export interface HerosVillage {
  public: PublicHeros
  /** Le mot posé sur l'encart : « Entraide », « À la une », « Urgence »… */
  etiquette: string
  titre: string
  sousTitre: string | null
  /** URL d'image. Saisie à la main, ou reprise de la fiche choisie. */
  image: string | null
  cible: CibleHeros
  /** Reprendre le héros en bandeau sur la carte, avec les mises en avant. */
  surCarte: boolean
}

export const HEROS_VIDE: HerosVillage = {
  public: 'masque',
  etiquette: 'À la une',
  titre: '',
  sousTitre: null,
  image: null,
  cible: { sorte: 'lien', url: '' },
  surCarte: false,
}

const texte = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s.slice(0, max) : null
}

/**
 * Une adresse telle qu'on la colle : « www.cagnotte.fr/x » ou « cagnotte.fr »
 * sont des liens, il leur manque juste le https://. Sans ce complément, la
 * fiche était écartée à la relecture et disparaissait de l'admin.
 */
export function completerUrl(v: string): string {
  const s = v.trim()
  if (!s || /^https?:\/\//i.test(s)) return s
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/i.test(s)) return `https://${s}`
  return s
}

/** Le nom du site, faute de mieux : « cagnotte.fr ». */
function domaine(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

/**
 * Relit ce qui est stocké. Rend `null` si le héros n'a pas de quoi s'afficher
 * — une cible, et un titre — plutôt qu'un encart à moitié rempli.
 *
 * Un lien collé SEUL s'affiche : son titre par défaut est le nom du site.
 *
 * `brouillon` : l'admin relit AUSSI les fiches incomplètes. Sinon une fiche
 * qu'on vient d'ajouter, ou dont on n'a encore collé que le lien, s'évanouit
 * au rechargement de l'écran — alors même qu'elle est bien en base.
 */
export function normaliserHeros(brut: unknown, brouillon = false): HerosVillage | null {
  let o: unknown = brut
  if (typeof o === 'string') { try { o = JSON.parse(o) } catch { return null } }
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>

  const c = r.cible as Record<string, unknown> | undefined
  let cible: CibleHeros | null = null
  if (c?.sorte === 'lien') {
    const url = completerUrl(texte(c.url, 600) ?? '')
    if (/^https?:\/\//i.test(url)) cible = { sorte: 'lien', url }
    else if (brouillon) cible = { sorte: 'lien', url }
  } else if (c?.sorte === 'interne') {
    const id = texte(c.id, 128)
    const kind = texte(c.kind, 20)
    if (id && kind) cible = { sorte: 'interne', kind: kind as EmbedKind, id }
  }
  if (!cible) {
    if (!brouillon) return null
    cible = { sorte: 'lien', url: '' }
  }

  const titre = texte(r.titre, 120)
    ?? (brouillon ? '' : cible.sorte === 'lien' ? domaine(cible.url) : null)
  if (titre === null) return null

  const pub = r.public
  return {
    public: pub === 'tous' || pub === 'admin' ? pub : 'masque',
    etiquette: texte(r.etiquette, 24) ?? 'À la une',
    titre,
    sousTitre: texte(r.sousTitre, 200),
    image: (() => { const i = texte(r.image, 600); return i && /^https?:\/\//i.test(i) ? i : null })(),
    cible,
    surCarte: r.surCarte === true,
  }
}

/**
 * Relit la config, qui porte SOIT une fiche seule (l'ancien format, d'avant
 * le défilement), SOIT une liste. Les deux continuent de se lire : une config
 * déjà en place n'a rien à rejouer, elle devient une liste d'un élément.
 *
 * Les fiches incomplètes sont écartées une par une plutôt que de faire
 * échouer la liste entière — une ligne à moitié remplie en admin ne doit pas
 * emporter les autres avec elle.
 */
export function normaliserHerosListe(brut: unknown, brouillon = false): HerosVillage[] {
  let o: unknown = brut
  if (typeof o === 'string') { try { o = JSON.parse(o) } catch { return [] } }
  if (Array.isArray(o)) {
    return o.map(x => normaliserHeros(x, brouillon)).filter((h): h is HerosVillage => h !== null)
  }
  const seul = normaliserHeros(o, brouillon)
  return seul ? [seul] : []
}

/** Faut-il montrer ce héros à cette personne ? */
export function herosVisible(h: HerosVillage | null, estAdmin: boolean): boolean {
  if (!h) return false
  if (h.public === 'tous') return true
  if (h.public === 'admin') return estAdmin
  return false
}

/**
 * Où mène le héros.
 *
 * Les adresses internes se recalculent depuis le type et l'identifiant —
 * jamais figées, sinon un changement de route laisse un lien mort. Cf. la même
 * règle dans embedSnapshot.
 */
export function lienHeros(h: HerosVillage): string {
  if (h.cible.sorte === 'lien') return h.cible.url
  const { kind, id } = h.cible
  switch (kind) {
    case 'event':    return `/evenement/${id}`
    case 'etab':     return `/etablissement/${id}`
    case 'producer': return `/producteur/${id}`
    case 'annonce':  return `/annonces/${id}`
    case 'promo':    return '/promotions'
    case 'covoit':   return `/covoiturage/${id}`
    case 'article':  return `/journal/articles/${id}/view`
    case 'debat':    return `/forum/${id}`
    default:         return '/'
  }
}

/** Un lien du dehors s'ouvre dans un onglet neuf ; une fiche, dans l'app. */
export function herosExterne(h: HerosVillage): boolean {
  return h.cible.sorte === 'lien'
}
