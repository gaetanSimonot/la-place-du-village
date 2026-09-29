/**
 * L'ORDRE DES SECTIONS DE LA PAGE VILLAGE — réglé dans /admin/hub-carousel,
 * clé `village_ordre` (une liste d'identifiants).
 *
 * Réglage d'INTERFACE, donc global (cf. configCles.ts) : tous les territoires
 * s'ouvrent dans le même ordre. Le haut de page (héros, grand titre) et
 * l'Assistant restent fixes ; seules les sections ci-dessous se déplacent.
 *
 * Comme les effets : le téléphone garde le dernier ordre lu et ouvre le
 * Village avec lui, pour que les sections ne se réarrangent pas sous les
 * yeux à l'ouverture.
 */
export const SECTIONS_VILLAGE = [
  { id: 'aujourdhui', label: 'Aujourd’hui près de chez vous' },
  { id: 'cinema',     label: 'Au cinéma' },
  { id: 'theatre',    label: 'Au théâtre' },
  { id: 'radio',      label: 'À la radio' },
  { id: 'annonces',   label: 'Petites annonces' },
  { id: 'abonnement', label: 'Encart abonnement (comptes gratuits)' },
  { id: 'rubriques',  label: 'Nos rubriques' },
  { id: 'fil',        label: 'Le fil du territoire' },
] as const

export type SectionVillage = typeof SECTIONS_VILLAGE[number]['id']

export const ORDRE_DEFAUT: SectionVillage[] = SECTIONS_VILLAGE.map(s => s.id)

/**
 * Relit un ordre stocké. Tolérant : un identifiant inconnu est ignoré, une
 * section absente (ajoutée depuis) reprend sa place à la fin — une nouvelle
 * section n'est jamais perdue parce qu'un vieil ordre ne la connaît pas.
 */
export function parseOrdre(v: string | null | undefined): SectionVillage[] {
  let lu: unknown = null
  try { lu = v ? JSON.parse(v) : null } catch { lu = null }
  const connus = new Set<string>(ORDRE_DEFAUT)
  const ordre = Array.isArray(lu) ? lu.filter((x): x is SectionVillage => typeof x === 'string' && connus.has(x)) : []
  const vus = new Set(ordre)
  return [...Array.from(new Set(ordre)), ...ORDRE_DEFAUT.filter(id => !vus.has(id))]
}

export const CLE_CACHE_ORDRE = 'pdv-village-ordre'

export function lireOrdreEnCache(): SectionVillage[] {
  if (typeof window === 'undefined') return ORDRE_DEFAUT
  try { return parseOrdre(localStorage.getItem(CLE_CACHE_ORDRE)) } catch { return ORDRE_DEFAUT }
}

export function garderOrdreEnCache(o: SectionVillage[]): void {
  try { localStorage.setItem(CLE_CACHE_ORDRE, JSON.stringify(o)) } catch { /* stockage indisponible */ }
}
