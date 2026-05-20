/**
 * PHONE FRAME
 *
 * Wrapper qui ne fait rien sur mobile (largeur < 600px) et qui sur tablette
 * /desktop encadre toute l'app dans une "frame" type téléphone : largeur
 * fixe ~430px, hauteur dynamique, ombre et coins arrondis, sur un fond
 * gris neutre.
 *
 * Hack-clé : le frame applique `transform: translateZ(0)` ce qui le rend
 * "containing block" pour les éléments `position: fixed` enfants. Du coup
 * tous les composants déjà écrits pour mobile (BottomNav, modales, FAB,
 * sticky topbars…) se relativisent au frame, pas au viewport. AUCUN
 * composant existant n'a besoin d'être touché.
 *
 * Active dès 600px de viewport (tablette portrait), ce qui veut dire que
 * sur un vrai téléphone (≤ ~430px) le wrapper est totalement transparent.
 */

import './phone-frame.css'

export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pf-bg">
      <div className="pf-frame">
        {children}
      </div>
    </div>
  )
}
