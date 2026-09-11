'use client'

import { useMemo } from 'react'
import { ETAB_TYPE_LIST } from '@/lib/etablissement-types'
import { PRODUIT_CATS } from '@/lib/produit-cats'
import type { EtablissementType, EtablissementCard, ProducerCard } from '@/lib/types'

/**
 * COLONNE DE FILTRES DE L'ANNUAIRE — version ordinateur.
 *
 * Le pendant exact de `DesktopMapFilters`, pour l'autre face de la carte :
 * les commerces et les producteurs. Sur mobile, le type se choisit dans une
 * rangée de pastilles qui défile ; sur un écran de bureau, la place existe
 * pour tout montrer d'un coup, avec le nombre derrière chaque entrée.
 *
 * Masquée en dessous de 1024 px par `.pcv-only`.
 *
 * ÉTAT PARTAGÉ : cette colonne écrit dans le MÊME état que les pastilles de
 * la feuille. Changer ici met à jour là-bas, et l'inverse — il n'y a qu'une
 * vérité, rien n'est dupliqué.
 *
 * LES COMPTEURS se lisent sur la liste AVANT filtrage : c'est la seule qui
 * puisse dire ce qu'il y a derrière une entrée qu'on n'a pas choisie. Leur
 * passer la liste déjà filtrée mettrait toutes les autres à zéro au premier
 * clic — le défaut que la colonne des événements avait, et qui rendait la
 * colonne inutilisable dès qu'on s'en servait.
 */

export default function DesktopAnnuaireFilters({
  onglet, etablissements, producteurs,
  typeActif, onTypeChange,
  catsActives, onCatsChange,
}: {
  /** 1 = commerces, 0 = producteurs. Les deux n'ont pas les mêmes filtres. */
  onglet: number
  /** Commerces de la zone, TOUS types confondus. */
  etablissements: EtablissementCard[]
  /** Producteurs de la zone, toutes catégories confondues. */
  producteurs: ProducerCard[]
  typeActif: EtablissementType | null
  onTypeChange: (t: EtablissementType | null) => void
  catsActives: string[]
  onCatsChange: (c: string[]) => void
}) {
  const parType = useMemo(() => {
    const m = new Map<string, number>()
    etablissements.forEach(e => { if (e.type) m.set(e.type, (m.get(e.type) ?? 0) + 1) })
    return m
  }, [etablissements])

  /** Un producteur peut relever de plusieurs catégories de produits. */
  const parCategorie = useMemo(() => {
    const m = new Map<string, number>()
    producteurs.forEach(p => {
      new Set(p.produit_categories ?? []).forEach(c => { if (c) m.set(c, (m.get(c) ?? 0) + 1) })
    })
    return m
  }, [producteurs])

  const commerces = onglet === 1
  const catActive = catsActives[0] ?? null

  return (
    <aside className="pcv-only pcv-mapFlt pcv-scroll">
      {commerces ? (
        <div className="pcv-fltG">
          <h5>Commerces</h5>
          <ul>
            <li>
              <button
                type="button"
                className={!typeActif ? 'pcv-fltOn' : undefined}
                onClick={() => onTypeChange(null)}
              >
                Tout<i>{etablissements.length}</i>
              </button>
            </li>
            {ETAB_TYPE_LIST.map(t => (
              <li key={t.id}>
                <button
                  type="button"
                  className={typeActif === t.id ? 'pcv-fltOn' : undefined}
                  onClick={() => onTypeChange(typeActif === t.id ? null : t.id)}
                >
                  {/* Même pastille et même emoji que sur la carte et dans la
                      feuille : un seul repère visuel par type. */}
                  <span className="pcv-fltIco" style={{ background: `${t.color}1F`, color: t.color }}>
                    {t.emoji}
                  </span>
                  {t.label}
                  <i>{parType.get(t.id) ?? 0}</i>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="pcv-fltG">
          <h5>Producteurs</h5>
          <ul>
            <li>
              <button
                type="button"
                className={!catActive ? 'pcv-fltOn' : undefined}
                onClick={() => onCatsChange([])}
              >
                Tout<i>{producteurs.length}</i>
              </button>
            </li>
            {PRODUIT_CATS.map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  className={catActive === c.id ? 'pcv-fltOn' : undefined}
                  onClick={() => onCatsChange(catActive === c.id ? [] : [c.id])}
                >
                  {/* Les catégories de produits n'ont pas de couleur propre
                      dans le référentiel — contrairement aux types de
                      commerce. L'emoji suffit à les distinguer ; leur en
                      inventer une ici créerait un second référentiel. */}
                  <span className="pcv-fltIco" style={{ background: '#E8F2EB', color: '#2D5A3D' }}>
                    {c.emoji}
                  </span>
                  {c.label}
                  <i>{parCategorie.get(c.id) ?? 0}</i>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
