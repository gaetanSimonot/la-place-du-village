'use client'
import { useTerritoire } from './TerritoireProvider'

/**
 * Le choix du territoire regarde.
 *
 * Pose a DEUX endroits sans etre recopie : le panneau « Reglages de la carte »
 * et le tableau de bord admin. Il ne verifie pas lui-meme qui appelle —
 * `TerritoireProvider` ignore deja le choix de qui n'est pas admin, et le
 * composant se tait quand il n'y a qu'un territoire : un selecteur a un seul
 * choix n'apprend rien.
 */
export default function TerritoirePicker({ compact = false }: { compact?: boolean }) {
  const { territoire, territoires, choisirTerritoire, peutBasculer } = useTerritoire()
  if (!peutBasculer) return null

  const defaut = territoires.find(t => t.par_defaut)

  return (
    <div>
      {!compact && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1209', marginBottom: 2 }}>
            Territoire
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginBottom: 8 }}>
            Ce que TU regardes. Les habitants restent sur {defaut?.nom ?? 'le territoire par défaut'}.
          </div>
        </>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {territoires.map(t => {
          const actif = t.slug === territoire?.slug
          return (
            <button
              key={t.id}
              onClick={() => choisirTerritoire(t.slug)}
              style={{
                padding: compact ? '6px 12px' : '8px 14px',
                borderRadius: 999, cursor: 'pointer',
                border: actif ? '2px solid #2D5A3D' : '1.5px solid #E5DDD2',
                background: actif ? '#E8F2EB' : '#fff',
                color: actif ? '#2D5A3D' : '#7A6A5A',
                fontWeight: 700, fontSize: compact ? 12 : 13, fontFamily: 'inherit',
              }}
            >
              {t.nom}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Le rappel permanent : « tu regardes Pau ».
 *
 * Sans lui, une app vide se lit comme une panne. Il ne s'affiche QUE hors du
 * territoire par defaut — donc jamais pour un habitant, et jamais pour l'admin
 * tant qu'il est chez lui.
 */
export function TerritoireBandeau() {
  const { territoire, territoires, choisirTerritoire, peutBasculer } = useTerritoire()
  if (!peutBasculer || !territoire || territoire.par_defaut) return null

  const defaut = territoires.find(t => t.par_defaut)

  return (
    <button
      onClick={() => defaut && choisirTerritoire(defaut.slug)}
      style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 6px)', left: '50%',
        transform: 'translateX(-50%)', zIndex: 400,
        padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: '#1C3829', color: '#fff', fontSize: 11, fontWeight: 700,
        fontFamily: 'var(--font-body), sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      }}
    >
      <span>Vue {territoire.nom}</span>
      <span style={{ opacity: 0.6, fontWeight: 500 }}>· revenir</span>
    </button>
  )
}
