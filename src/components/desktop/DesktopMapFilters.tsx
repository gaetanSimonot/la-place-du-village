'use client'

import { useMemo } from 'react'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie, Filtres, FiltreQuand, EvenementCard } from '@/lib/types'

/**
 * COLONNE DE FILTRES DE LA CARTE — version ordinateur.
 *
 * Sur mobile, « Que faire » et « Quand » sont deux molettes qui avancent d'un
 * cran à chaque appui : c'est ce qui tient dans une feuille de 430 px. Sur un
 * écran de bureau, la place existe pour tout montrer d'un coup, avec le
 * nombre d'événements derrière chaque entrée.
 *
 * Masquée en dessous de 1024 px par `.pcv-only`.
 *
 * ÉTAT PARTAGÉ : cette colonne écrit dans le MÊME `filtres` que les molettes
 * de la barre flottante. Changer ici met à jour là-bas, et l'inverse — il n'y
 * a qu'une vérité, et rien n'est dupliqué.
 */

const QUAND: { value: FiltreQuand; label: string }[] = [
  { value: 'toujours',      label: 'Tout' },
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_week_end',   label: 'Ce week-end' },
  { value: 'ce_mois',       label: 'Ce mois' },
]

export default function DesktopMapFilters({ filtres, onFiltresChange, evenements }: {
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  /**
   * Les événements de la zone AVANT le filtre de catégorie : c'est la seule
   * liste qui puisse dire combien il y a d'événements derrière les entrées
   * qu'on n'a pas sélectionnées.
   */
  evenements: EvenementCard[]
}) {
  const parCategorie = useMemo(() => {
    const m = new Map<string, number>()
    evenements.forEach(e => {
      const cats = (e.categories?.length ? e.categories : [e.categorie]) as string[]
      new Set(cats).forEach(c => { if (c) m.set(c, (m.get(c) ?? 0) + 1) })
    })
    return m
  }, [evenements])

  const catActive = filtres.categories[0] as Categorie | undefined
  const cats = Object.keys(CATEGORIES) as Categorie[]

  return (
    <aside className="pcv-only pcv-mapFlt pcv-scroll">
      <div className="pcv-fltG">
        <h5>Que faire</h5>
        <ul>
          <li>
            <button
              type="button"
              className={!catActive ? 'pcv-fltOn' : undefined}
              onClick={() => onFiltresChange({ ...filtres, categories: [] })}
            >
              Tout<i>{evenements.length}</i>
            </button>
          </li>
          {cats.map(c => (
            <li key={c}>
              <button
                type="button"
                className={catActive === c ? 'pcv-fltOn' : undefined}
                onClick={() => onFiltresChange({
                  ...filtres,
                  categories: catActive === c ? [] : [c],
                })}
              >
                <span className="pcv-fltDot" style={{ background: CATEGORIES[c].color }} />
                {CATEGORIES[c].label}
                <i>{parCategorie.get(c) ?? 0}</i>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pcv-fltG">
        <h5>Quand</h5>
        <ul>
          {QUAND.map(q => (
            <li key={q.value}>
              <button
                type="button"
                className={filtres.quand === q.value && !filtres.date ? 'pcv-fltOn' : undefined}
                // Choisir une période efface la date précise : les deux
                // répondent à la même question, garder les deux serait un
                // filtre qui se contredit.
                onClick={() => onFiltresChange({ ...filtres, quand: q.value, date: null })}
              >
                {q.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {filtres.date && (
        <div className="pcv-fltG">
          <h5>Date choisie</h5>
          <button type="button" className="pcv-fltDate"
                  onClick={() => onFiltresChange({ ...filtres, date: null })}>
            {new Date(filtres.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            <span aria-hidden>✕</span>
          </button>
        </div>
      )}
    </aside>
  )
}
