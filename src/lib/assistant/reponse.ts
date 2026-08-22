import type { Carte } from '@/lib/assistant/outils'

/**
 * ASSISTANT VILLAGE — le filet sous la réponse. SERVEUR UNIQUEMENT.
 *
 * Deux défauts observés au banc d'essai, et aucun ne se règle par une
 * consigne : un modèle obéit la plupart du temps, ce qui ne suffit pas quand
 * l'enjeu est de ne jamais montrer une information fausse.
 *
 *   1. UNE FICHE CITÉE QUI N'A PAS ÉTÉ TROUVÉE. Identifiant inventé, ou
 *      repris d'un tour précédent — c'est ainsi qu'un événement de samedi
 *      ressortait sur une question portant sur dimanche. Le filtre des dates
 *      est déjà fait en base ; encore faut-il que le modèle ne cite que ce
 *      qu'on vient de lui rendre.
 *   2. DES MARQUEURS EMPILÉS EN FIN DE RÉPONSE. Cinq paragraphes, puis cinq
 *      cartes d'affilée : on ne sait plus laquelle correspond à quoi.
 *
 * On ne demande donc plus : on impose. Ce module ne connaît aucun modèle, ce
 * qui est le but — il protège aussi bien celui d'aujourd'hui que le prochain.
 */

const MARQUEUR = /\[\[(ev|etab|prod|film|promo|annonce):([^\]\s]+)\]\]/g

/** Le nom porté par une fiche, quelle que soit sa table. */
function titreDe(c: Carte): string {
  const d = c.data
  const v = d.nom ?? d.titre ?? d.title
  return typeof v === 'string' ? v : ''
}

/** Sans accents ni casse : pour retrouver un titre dans une phrase. */
const nu = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’.]/g, ' ')

/**
 * Le texte, débarrassé de ce qui ne tient pas.
 *
 * `cartes` est la liste EXACTE de ce que les outils ont rendu pendant ce
 * tour : tout marqueur qui n'y figure pas disparaît. Le modèle ne peut donc
 * pas faire apparaître une fiche qu'il n'a pas trouvée, ni ressortir celle
 * d'une question précédente.
 */
export function verrouillerReponse(texte: string, cartes: Carte[]): string {
  const connus = new Set(cartes.map(c => c.id))
  const cites = new Set<string>()

  // ── 1. On ne garde que ce qui a vraiment été trouvé ──────────────────
  let net = texte.replace(MARQUEUR, (tout, _type, id: string) => {
    if (!connus.has(id) || cites.has(id)) return ''
    cites.add(id)
    return tout
  })

  // ── 2. Un marqueur par ligne, jamais collé au texte ──────────────────
  net = net.replace(/[ \t]*(\[\[[a-z]+:[^\]\s]+\]\])[ \t]*/g, '\n$1\n')

  net = replacerLesGroupes(net, cartes)

  // Les suppressions laissent des trous : on les referme.
  return net.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Remet chaque fiche derrière la phrase qui en parle.
 *
 * Certains modèles décrivent tout en prose, puis alignent les marqueurs à la
 * fin. On cherche alors, pour chacun, la ligne où son titre apparaît, et on
 * l'y replace. Sans correspondance trouvée, on le laisse où il est — mieux
 * vaut une carte mal placée qu'une carte perdue.
 */
function replacerLesGroupes(texte: string, cartes: Carte[]): string {
  const lignes = texte.split('\n')
  const estMarqueur = (l: string) => /^\s*\[\[[a-z]+:[^\]\s]+\]\]\s*$/.test(l)

  // Le bloc de fin : des marqueurs à la suite, éventuellement séparés de
  // lignes vides, et plus rien d'autre après.
  let debut = lignes.length
  for (let i = lignes.length - 1; i >= 0; i--) {
    const l = lignes[i]
    if (!l.trim()) continue
    if (estMarqueur(l)) { debut = i; continue }
    break
  }
  const groupe = lignes.slice(debut).filter(estMarqueur)
  // Moins de trois d'affilée : c'est une fin de réponse normale.
  if (groupe.length < 3) return texte

  const avant = lignes.slice(0, debut)
  const parId = new Map(cartes.map(c => [c.id, c]))
  const restants: string[] = []

  for (const m of groupe) {
    const id = m.match(/\[\[[a-z]+:([^\]\s]+)\]\]/)?.[1]
    const carte = id ? parId.get(id) : undefined
    const titre = carte ? nu(titreDe(carte)) : ''
    // On cherche le premier mot distinctif du titre dans le texte : les noms
    // sont souvent raccourcis en prose (« Le Milonga » pour « Le Milonga —
    // Bar à vins »), une correspondance exacte échouerait presque toujours.
    const cle = titre.split(/\s+/).filter(m2 => m2.length > 3).slice(0, 2).join(' ')
    const i = cle ? avant.findIndex(l => nu(l).includes(cle)) : -1
    if (i >= 0) avant.splice(i + 1, 0, m.trim())
    else restants.push(m.trim())
  }

  return [...avant, ...restants].join('\n')
}
