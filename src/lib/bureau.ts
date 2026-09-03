/**
 * Le point de rupture « ordinateur », côté JavaScript.
 *
 * C'est le jumeau exact du `@media (min-width: 1024px)` qui commande toutes
 * les feuilles `desktop*.css`. Les deux doivent dire la même chose : si le CSS
 * bascule en version bureau alors que le JS croit être sur un téléphone (ou
 * l'inverse), on obtient une mise en page de bureau pilotée par des gestes de
 * mobile — c'est précisément ce qui donnait un splash plein écran aux
 * proportions absurdes sur ordinateur.
 *
 * Sûr au rendu serveur : sans `window`, on répond « non ». À n'appeler que
 * dans un effet ou un gestionnaire, jamais pendant le rendu — sinon le serveur
 * et le navigateur produisent deux arbres différents et React proteste.
 */
export const RUPTURE_BUREAU = '(min-width: 1024px)'

export function ecranBureau(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(RUPTURE_BUREAU).matches
}
