'use client'
import { useEffect, useRef } from 'react'
import ClientPortal from '@/components/ClientPortal'
import PastilleStatut from '@/components/bois/PastilleStatut'
import { libelleMilieu, type Champignon } from '@/lib/champignons'

/**
 * La fiche détaillée d'une espèce — photo et crédit, saison et milieu,
 * « Le reconnaître », « Ne pas confondre avec », puis soit « En cuisine »
 * (comestibles), soit le danger.
 *
 * PLEIN ÉCRAN, avec une barre retour + partage, comme les fiches film et
 * spectacle. Le premier jet était une feuille presque pleine hauteur : la
 * page du dessous dépassait en haut, coupée au milieu d'une phrase, et la
 * fiche cachait la bottom nav. Elle reste posée PAR-DESSUS le guide (et non
 * une autre page) pour que le retour retrouve la liste à l'endroit quitté ;
 * la bottom nav (z 50) reste devant elle.
 *
 * Un sosie présent dans le guide est un lien : on passe d'une fiche à
 * l'autre sans repasser par la liste.
 *
 * Rendue dans un portail (piège du contexte d'empilement) ; les couleurs
 * viennent de l'univers « bois », posé sur <html> par la page.
 */
export default function FicheChampignon({ espece, parLatin, onOuvrir, onFermer }: {
  espece: Champignon
  /** Les espèces du guide par nom latin, pour relier les sosies. */
  parLatin: Map<string, Champignon>
  onOuvrir: (c: Champignon) => void
  onFermer: () => void
}) {
  const corps = useRef<HTMLDivElement>(null)

  // Une nouvelle espèce s'ouvre en haut de sa fiche, pas au milieu de l'autre.
  useEffect(() => { corps.current?.scrollTo({ top: 0 }) }, [espece.id])

  // Échap ferme, et la page derrière ne défile pas pendant la lecture.
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', clavier)
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', clavier); document.body.style.overflow = avant }
  }, [onFermer])

  const mortel = espece.statut === 'mortel'

  return (
    <ClientPortal>
      <div ref={corps} role="dialog" aria-modal="true" aria-labelledby="fiche-champignon-titre"
        className="font-inter fixed inset-0 overflow-y-auto"
        style={{ zIndex: 40, background: 'var(--uni-panel)', color: 'var(--uni-ink)', paddingBottom: 92 }}>
        {/* Barre du haut, collante : retour au guide, titre centré — la barre
            des rubriques du site. Une case vide à droite garde le titre au
            centre. */}
        <div className="sticky top-0 flex items-center justify-between gap-2.5 px-4"
          style={{
            zIndex: 2, paddingTop: 'max(12px, env(safe-area-inset-top, 12px))', paddingBottom: 10,
            background: 'var(--uni-bg)', borderBottom: '1px solid var(--uni-line)',
          }}>
          <button onClick={onFermer} aria-label="Retour au guide"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ border: '1px solid var(--uni-line)', background: 'var(--uni-panel)', color: 'var(--uni-ink)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 truncate text-center font-serif text-[18px] leading-none" style={{ letterSpacing: '-0.01em' }}>
            Dans nos bois
          </div>
          <span className="w-10 shrink-0" aria-hidden />
        </div>

        <div className="mx-auto" style={{ maxWidth: 680 }}>
          <div style={{ aspectRatio: '4 / 3', background: 'var(--uni-vide)' }}>
            {espece.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={espece.photo_url} alt={espece.nom} className="block h-full w-full object-cover" />
            )}
          </div>
          {espece.photo_credit && (
            <p className="m-0" style={{ padding: '6px 16px 0', fontSize: 11, color: 'var(--uni-dim2)' }}>
              Photo : {espece.photo_credit}
            </p>
          )}

          <div className="flex flex-col" style={{ padding: '14px 16px 26px', gap: 18, fontSize: 14.5, lineHeight: 1.55 }}>
            <div>
              <PastilleStatut statut={espece.statut} />
              <h2 id="fiche-champignon-titre" className="m-0 font-serif"
                style={{ marginTop: 10, fontSize: 25, lineHeight: 1.12, letterSpacing: '-0.02em', textWrap: 'balance' }}>
                {espece.nom}
              </h2>
              <div style={{ marginTop: 3, fontStyle: 'italic', fontSize: 13.5, color: 'var(--uni-dim)' }}>
                {espece.nom_latin}
              </div>
            </div>

            <div className="flex flex-wrap" style={{ gap: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--uni-dim)' }}>
              {espece.saison && <span>Saison : {espece.saison}</span>}
              {espece.milieux.length > 0 && <span>Milieu : {espece.milieux.map(libelleMilieu).join(', ')}</span>}
            </div>

            {espece.reconnaitre.length > 0 && (
              <section>
                <Intertitre>Le reconnaître</Intertitre>
                <ul className="m-0 flex flex-col" style={{ paddingLeft: 20, gap: 4, listStyle: 'disc' }}>
                  {espece.reconnaitre.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </section>
            )}

            {espece.sosies.length > 0 && (
              <section>
                <Intertitre>Ne pas confondre avec</Intertitre>
                <ul className="m-0 flex flex-col" style={{ paddingLeft: 20, gap: 4, listStyle: 'disc' }}>
                  {espece.sosies.map((s, i) => {
                    const cible = s.latin ? parLatin.get(s.latin) : undefined
                    return (
                      <li key={i}>
                        {cible ? (
                          <button onClick={() => onOuvrir(cible)}
                            className="border-none bg-transparent p-0"
                            style={{ fontSize: 'inherit', fontWeight: 700, color: 'var(--uni-accent)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>
                            {s.nom}
                          </button>
                        ) : <strong>{s.nom}</strong>}
                        {s.note ? ` : ${s.note}` : ''}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {espece.cuisine ? (
              <Encadre fond="var(--bois-okBg)" titre="En cuisine" couleur="var(--bois-ok)" texte={espece.cuisine} />
            ) : espece.danger ? (
              <Encadre
                fond={mortel ? 'var(--bois-deadBg)' : 'var(--bois-toxBg)'}
                couleur={mortel ? 'var(--bois-dead)' : 'var(--bois-tox)'}
                titre={mortel ? 'Danger mortel' : 'Pourquoi l’éviter'}
                texte={espece.danger} />
            ) : null}
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}

function Intertitre({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="m-0" style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--uni-accent)' }}>
      {children}
    </h3>
  )
}

function Encadre({ fond, couleur, titre, texte }: { fond: string; couleur: string; titre: string; texte: string }) {
  return (
    <section style={{ borderRadius: 10, padding: '12px 14px', background: fond }}>
      <h3 className="m-0" style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: couleur }}>
        {titre}
      </h3>
      <p className="m-0">{texte}</p>
    </section>
  )
}
