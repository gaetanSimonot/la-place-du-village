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

const BR = '\n'

/**
 * Les espaces sont tolérés autour de l'identifiant : certains modèles
 * écrivent « [[ev: 1234 ]] », et un marqueur non reconnu s'affichait tel quel
 * à l'écran — crochets compris — pendant que sa fiche disparaissait.
 */
const MARQUEUR = /\[\[(ev|etab|prod|film|promo|annonce):\s*([^\]\s]+)\s*\]\]/g

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
    // Réécrit au format canonique : le client reçoit toujours la même forme,
    // quel que soit le modèle qui a rédigé.
    return `[[${_type}:${id}]]`
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
 * Certains modèles décrivent tout d'un bloc, puis alignent les marqueurs à la
 * fin — parfois en un seul paragraphe, sans le moindre retour à la ligne où
 * glisser quoi que ce soit. On découpe donc le texte EN PHRASES, et on cherche
 * pour chaque fiche celle qui la mentionne. Six cartes empilées après un pavé,
 * on ne sait plus laquelle va avec quoi.
 *
 * Sans correspondance trouvée, la fiche reste en fin de réponse : mieux vaut
 * une carte mal placée qu'une carte perdue.
 */
function replacerLesGroupes(texte: string, cartes: Carte[]): string {
  const lignes = texte.split(BR)
  const estMarqueur = (l: string) => /^\s*\[\[[a-z]+:\s*[^\]\s]+\s*\]\]\s*$/.test(l)

  // Le bloc de fin : des marqueurs à la suite, et plus rien d'autre après.
  let debut = lignes.length
  for (let i = lignes.length - 1; i >= 0; i--) {
    const l = lignes[i]
    if (!l.trim()) continue
    if (estMarqueur(l)) { debut = i; continue }
    break
  }
  const groupe = lignes.slice(debut).filter(estMarqueur)
  if (groupe.length < 2) return texte

  // Chaque phrase devient une unité où poser une fiche. Un paragraphe unique
  // en fournit autant qu'il contient de phrases — sans ce découpage, il n'y
  // avait qu'une seule place possible, et donc aucune.
  const unites: string[] = []
  for (const ligne of lignes.slice(0, debut)) {
    if (!ligne.trim()) { unites.push(ligne); continue }
    for (const phrase of ligne.split(/(?<=[.!?…])\s+/)) {
      if (phrase.trim()) unites.push(phrase.trim())
    }
  }

  const parId = new Map(cartes.map(c => [c.id, c]))
  const restants: string[] = []
  const prises = new Set<number>()

  for (const m of groupe) {
    const id = m.match(/\[\[[a-z]+:\s*([^\]\s]+)\s*\]\]/)?.[1]
    const carte = id ? parId.get(id) : undefined
    const titre = carte ? nu(titreDe(carte)) : ''
    // On cherche les mots distinctifs du titre : en prose, les noms sont
    // raccourcis (« Le Milonga » pour « Le Milonga — Bar à vins »), et une
    // correspondance exacte échouerait presque toujours.
    const cles = titre.split(/\s+/).filter(x => x.length > 3).slice(0, 3)
    let i = -1
    for (const cle of cles) {
      i = unites.findIndex((u, k) => !estMarqueur(u) && !prises.has(k) && nu(u).includes(cle))
      if (i >= 0) break
    }
    if (i >= 0) {
      prises.add(i)
      // On insère après la phrase ET après les fiches déjà posées derrière
      // elle, pour garder l'ordre d'origine entre plusieurs cartes.
      let j = i + 1
      while (j < unites.length && estMarqueur(unites[j])) j++
      unites.splice(j, 0, m.trim())
    } else restants.push(m.trim())
  }

  // Une phrase suivie de sa fiche forme un bloc : on aère entre les blocs.
  const sortie: string[] = []
  for (const u of unites) {
    if (estMarqueur(u) || !sortie.length) sortie.push(u)
    else sortie.push('', u)
  }
  return [...sortie, ...restants].join(BR)
}
