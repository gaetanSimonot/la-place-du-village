/**
 * « MISE À JOUR » EN COURS ? — un petit registre partagé, hors de React.
 *
 * Les blocs du Village (via le middleware de ChargementGroupe) et la
 * vérification de version (VersionAJour) y signalent ce qu'ils sont en train
 * de rafraîchir ; l'indicateur à côté de « Aujourd'hui » s'y abonne.
 */
const enCours = new Set<string>()
const abonnes = new Set<() => void>()

export function signalerMiseAJour(id: string, actif: boolean) {
  const avant = enCours.size > 0
  if (actif) enCours.add(id)
  else enCours.delete(id)
  if ((enCours.size > 0) !== avant) abonnes.forEach(f => f())
}

export function abonnerMiseAJour(f: () => void): () => void {
  abonnes.add(f)
  return () => { abonnes.delete(f) }
}

export function miseAJourEnCours(): boolean {
  return enCours.size > 0
}
