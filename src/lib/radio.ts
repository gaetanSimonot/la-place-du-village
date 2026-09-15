/**
 * MODULE RADIO — types et helpers PARTAGÉS.
 *
 * Importé par des composants client : aucun accès base ici. Les requêtes
 * vivent dans les routes API — `supabase-admin` porte la clé service et son
 * import côté client fait planter la page au montage (même règle que
 * cinema.ts / cinema-server.ts).
 *
 * CE QU'EST UNE ÉMISSION. Radio Escapades diffuse chaque semaine sa sélection
 * culturelle. On en fait deux choses à la fois : on la donne à ÉCOUTER, et on
 * rend cliquable ce qu'elle annonce. La seconde moitié est la vraie valeur —
 * un podcast dit « samedi à Sauve » et personne ne retient l'adresse.
 *
 * CE QUI EST CITÉ N'EST PAS FORCÉMENT CHEZ NOUS. Une émission parle de ce
 * qu'elle veut ; une partie de ce qu'elle annonce n'est jamais passée par nos
 * collecteurs. Une mention porte donc TOUJOURS son titre en clair et
 * seulement PARFOIS un événement. Rattachée, on affiche la fiche et on y va ;
 * non rattachée, on affiche le titre et on s'arrête là. Un seul mécanisme avec
 * un champ vide, plutôt que deux listes à tenir d'accord.
 */

import type { EvenementCard } from './types'
import type { Visibilite } from './visibilite'

/**
 * La radio partenaire. En dur, parce qu'il n'y en a qu'une : le jour où il y
 * en a deux, ceci devient une table, pas avant. La colonne `radio` en base
 * garde la place au chaud.
 */
export const RADIO = {
  cle: 'escapades',
  nom: 'Radio Escapades',
  site: 'https://www.radioescapades.org',
} as const

/**
 * Le libellé de la mention, écrit UNE fois.
 *
 * Il apparaît sur la fiche, dans la liste et sur la carte. Trois copies d'une
 * chaîne finissent toujours par se contredire à la première reformulation.
 */
export const MENTION_RADIO = 'Sélection Radio Escapades'

export type StatutEmission = 'brouillon' | 'publie' | 'archive'

export interface EmissionRadio {
  id: string
  radio: string
  titre: string
  description: string | null
  /** URL du podcast. Chez eux le plus souvent — le recopier serait une copie à tenir. */
  audio_url: string
  duree_s: number | null
  image_url: string | null
  /** Un LUNDI : la clé qui dit de quelle semaine l'émission parle. */
  semaine_debut: string
  statut: StatutEmission
}

export interface MentionRadio {
  id: string
  /** Toujours rempli — c'est ce qui s'affiche quand `evenement` est null. */
  titre: string
  /** Le lieu et la date en clair, pour les mentions sans fiche. */
  detail: string | null
  ordre: number
  /** `null` = pas dans l'app : la ligne se lit, mais ne mène nulle part. */
  evenement: EvenementCard | null
}

export interface PayloadRadio {
  emission: EmissionRadio | null
  mentions: MentionRadio[]
  /**
   * Visibilité de TOUT le module : le bloc du Village, la mention sur les
   * fiches, et le bouton de la barre du haut. « Masqué » masque tout, et
   * c'est le seul réglage — le bouton du direct est permanent en dessous.
   */
  villageVisibilite: Visibilite
}

/**
 * La marque de la radio, déposée dans `public/radio/`.
 *
 * Un seul fichier : le rond. Il n'existe pas de version horizontale du logo,
 * alors la mention sur les fiches se compose — le rond, puis le texte, aux
 * couleurs de la radio. Mieux vaut assembler à partir de la vraie marque que
 * dessiner un logotype qui n'existe pas.
 */
/** Le rond, servi en 128 px (7 ko) : la barre du haut l'affiche en 38. */
export const LOGO_ROND = '/radio/escapades-rond-128.png'

/** L'original 512 px, gardé comme source — pour un usage plus grand un jour. */
export const LOGO_ROND_SOURCE = '/radio/escapades-rond.png'

/**
 * Le bleu de la radio, relevé sur le logo (#26328C).
 *
 * La mention sur les fiches porte CETTE couleur et pas l'orange de l'app :
 * c'est une marque extérieure, elle doit se lire comme telle. Partout
 * ailleurs, le module reste dans la palette de La Place.
 */
export const BLEU_RADIO = '#26328C'

/**
 * Le lundi de la semaine d'une date, en heure de Paris.
 *
 * `semaineDe()` fait déjà ce calcul pour la newsletter ; on le réutilise au
 * lieu d'en écrire un deuxième, parce qu'il est piégeux — le serveur tourne en
 * UTC et `toISOString()` recule d'un jour avant 2 h du matin en France.
 */
export { semaineDe, jourParis } from './semaine'

/** « 1847 » → « 30 min ». Rien au-dessous d'une minute : ça n'apprend rien. */
export function formatDuree(secondes: number | null | undefined): string | null {
  if (!secondes || secondes < 60) return null
  const min = Math.round(secondes / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const reste = min % 60
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`
}

/**
 * Une URL d'audio est-elle plausible ?
 *
 * Validée à la saisie, pas à l'affichage : un lecteur qui reste muet sans rien
 * dire est le pire des retours. On vérifie la forme, pas le contenu — seul le
 * navigateur sait vraiment lire un fichier.
 */
export function audioUrlValide(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/* ── Ce qu'on peut tirer d'une phrase dite à l'antenne ─────────────────── */

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

const JOURS_NOM = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Minuscules, sans accents — « août » et « aout » doivent se reconnaître. */
const aplatir = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export interface DatesDites {
  date_debut: string | null
  date_fin: string | null
  heure: string | null
}

/**
 * LIRE LA DATE DANS CE QUE L'ANIMATEUR A DIT.
 *
 * La transcription porte déjà l'information — « mardi 15 septembre à 20h,
 * salle de spectacle de Saint-Hippolyte ». La recopier à la main serait
 * absurde ; la deviner au jugé serait pire. On ne rend donc une date que
 * lorsqu'elle est ÉCRITE : un quantième et un mois, ou à défaut un jour de la
 * semaine — et dans ce dernier cas c'est celui de la semaine dont parle
 * l'émission, ce qui est le cas de très loin le plus fréquent et réduit le
 * risque d'erreur à presque rien.
 *
 * « JUSQU'AU » ANNONCE UNE FIN, PAS UN DÉBUT. « jusqu'au 26 septembre » pour
 * une exposition déjà ouverte : poser cette date en date de début décalerait
 * l'événement de plusieurs semaines. Elle part donc en date de fin, et le
 * début reste vide.
 *
 * Tout ce qui sort d'ici est PROPOSÉ, jamais enregistré : l'éditeur s'ouvre
 * prérempli et c'est un humain qui valide.
 */
export function datesDepuisDetail(detail: string | null | undefined, semaineDebut: string): DatesDites {
  const vide: DatesDites = { date_debut: null, date_fin: null, heure: null }
  if (!detail) return vide
  const t = aplatir(detail)

  // ── L'heure : « à 20h », « à partir de 18h », « 18h15 » ──────────────
  let heure: string | null = null
  const mh = t.match(/(\d{1,2})\s*h\s*(\d{2})?/)
  if (mh) {
    const h = Number(mh[1])
    const m = mh[2] ? Number(mh[2]) : 0
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      heure = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }

  // ── Les dates écrites en toutes lettres : « 15 septembre » ───────────
  const anneeRef = Number(semaineDebut.slice(0, 4))
  const ancre = Date.parse(`${semaineDebut}T12:00:00Z`)
  const trouvees: { pos: number; date: string }[] = []

  const motif = new RegExp('(\\d{1,2})\\s+(' + MOIS.join('|') + ')', 'g')
  let m: RegExpExecArray | null
  while ((m = motif.exec(t)) !== null) {
    const jour = Number(m[1])
    const mois = MOIS.indexOf(m[2])
    if (jour < 1 || jour > 31) continue

    /*
     * L'ANNÉE VIENT DE L'ÉMISSION, avec un rattrapage de fin d'année.
     * Une émission du 30 décembre qui annonce « le 3 janvier » parle de
     * l'année suivante : sans ce report, on daterait l'événement onze mois
     * plus tôt.
     */
    let candidate = `${anneeRef}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
    if (Date.parse(`${candidate}T12:00:00Z`) < ancre - 120 * 86_400_000) {
      candidate = `${anneeRef + 1}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
    }
    if (!Number.isNaN(Date.parse(`${candidate}T12:00:00Z`))) {
      trouvees.push({ pos: m.index, date: candidate })
    }
  }

  if (trouvees.length >= 2) {
    return { date_debut: trouvees[0].date, date_fin: trouvees[1].date, heure }
  }

  if (trouvees.length === 1) {
    // « jusqu'au » juste avant la date : c'est une fin.
    const avant = t.slice(0, trouvees[0].pos)
    const estUneFin = /jusqu'?\s*au?\s*$|jusqu'?\s*au?\s+le?\s*$/.test(avant.trim() + ' ')
      || /jusqu'?\s*au?\s+$/.test(avant)
    return estUneFin
      ? { date_debut: null, date_fin: trouvees[0].date, heure }
      : { date_debut: trouvees[0].date, date_fin: null, heure }
  }

  // ── À défaut, un jour de la semaine : celui de la semaine de l'émission
  for (let i = 0; i < JOURS_NOM.length; i++) {
    if (new RegExp('\\b' + JOURS_NOM[i] + '\\b').test(t)) {
      const d = new Date(ancre + i * 86_400_000)
      return { date_debut: d.toISOString().slice(0, 10), date_fin: null, heure }
    }
  }

  return { ...vide, heure }
}
