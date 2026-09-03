'use client'

import Link from 'next/link'

/**
 * COLONNE DE FILTRES — version ordinateur (handoff §5 et §6).
 *
 * Sur mobile, les filtres sont des pastilles qui défilent et un tiroir : la
 * place manque. Sur un écran de bureau ils tiennent tous ouverts dans une
 * colonne de 228 px, chacun avec son compteur — on voit d'un coup d'œil ce
 * que chaque filtre contient avant de cliquer.
 *
 * Masquée en dessous de 1024 px par `.pcv-only` : le mobile garde ses
 * pastilles, inchangées.
 *
 * Ce composant ne tient AUCUN état : il reçoit les groupes déjà calculés et
 * rappelle l'écran au clic. C'est l'écran qui reste maître de ses filtres,
 * les mêmes que ceux du mobile — rien n'est dupliqué.
 */

export interface EntreeFiltre {
  label: string
  /** Nombre d'éléments derrière cette entrée. Absent = pas de compteur. */
  compte?: number
  actif: boolean
  onClick: () => void
  /** Pastille de couleur, pour les types d'annonce. */
  couleur?: string
}

export interface GroupeFiltre {
  titre: string
  entrees: EntreeFiltre[]
}

export default function DesktopFiltres({ groupes, action }: {
  groupes: GroupeFiltre[]
  /** Encart du bas : un bouton et sa phrase. */
  action?: { href: string; label: string; phrase?: string }
}) {
  return (
    <aside className="pcv-only pcv-flt">
      {groupes.map(g => (
        <div key={g.titre} className="pcv-fltG">
          <h5>{g.titre}</h5>
          <ul>
            {g.entrees.map(e => (
              <li key={e.label}>
                <button
                  type="button"
                  onClick={e.onClick}
                  className={e.actif ? 'pcv-fltOn' : undefined}
                  aria-pressed={e.actif}
                >
                  {e.couleur && <span className="pcv-fltDot" style={{ background: e.couleur }} />}
                  {e.label}
                  {typeof e.compte === 'number' && <i>{e.compte}</i>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {action && (
        <div className="pcv-fltG">
          <Link href={action.href} className="pcv-fltBtn">{action.label}</Link>
          {action.phrase && <p className="pcv-fltP">{action.phrase}</p>}
        </div>
      )}
    </aside>
  )
}
