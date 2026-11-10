/**
 * L'ADRESSE D'UNE FICHE ÉVÉNEMENT : LE NOM, PUIS L'IDENTIFIANT.
 *
 *   /evenement/kermesse-de-l-ecole-c09522dc-b7af-4714-9ce8-83a512ad1842
 *
 * Le nom sert aux moteurs et à qui lit le lien ; seul l'identifiant, en fin
 * d'adresse, désigne la fiche. Un titre corrigé change donc l'adresse sans
 * rien casser : l'ancienne renvoie vers la nouvelle (redirection permanente
 * posée par src/app/evenement/[id]/page.tsx), comme l'adresse nue
 * /evenement/<id> des notifications et newsletters déjà envoyées.
 *
 * Sans dépendance serveur : appelée aussi bien par les cartes de l'app que
 * par le sitemap.
 */

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** « Fête du Château — Ganges ! » → « fete-du-chateau-ganges ». Coupé à un mot entier. */
export function slugifier(texte: string, max = 60): string {
  const s = texte
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (s.length <= max) return s
  const coupe = s.slice(0, max)
  const i = coupe.lastIndexOf('-')
  return (i > 20 ? coupe.slice(0, i) : coupe).replace(/-+$/, '')
}

export function lienEvenement(e: { id: string; titre: string | null }): string {
  const nom = e.titre ? slugifier(e.titre) : ''
  return `/evenement/${nom ? `${nom}-` : ''}${e.id}`
}

/** L'identifiant porté par la fin de l'adresse ; l'adresse entière si elle n'en porte pas. */
export function idEvenementDe(param: string): string {
  let p = param
  try { p = decodeURIComponent(param) } catch { /* adresse mal encodée : telle quelle */ }
  const m = p.match(UUID)
  return m ? m[1].toLowerCase() : p
}
