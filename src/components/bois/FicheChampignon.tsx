'use client'
import { useEffect, useRef } from 'react'
import ClientPortal from '@/components/ClientPortal'
import PastilleStatut from '@/components/bois/PastilleStatut'
import { libelleMilieu, type Champignon } from '@/lib/champignons'

/**
 * La fiche détaillée d'une espèce — la feuille du guide : photo et crédit,
 * saison et milieu, « Le reconnaître », « Ne pas confondre avec », puis soit
 * « En cuisine » (comestibles), soit le danger.
 *
 * Un sosie présent dans le guide est un lien : on passe d'une fiche à
 * l'autre sans refermer, comme dans le guide d'origine.
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
      <div role="dialog" aria-modal="true" aria-labelledby="fiche-champignon-titre"
        className="fixed inset-0 flex items-end justify-center lg:items-center"
        style={{ zIndex: 3400, background: 'rgba(10,14,11,.55)' }}
        onClick={onFermer}>
        <div ref={corps} onClick={e => e.stopPropagation()}
          className="font-alegreyaSans w-full overflow-y-auto lg:rounded-[16px]"
          style={{
            maxWidth: 680, maxHeight: 'calc(100dvh - 24px)', background: 'var(--uni-panel)', color: 'var(--uni-ink)',
            borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
          <div className="relative" style={{ aspectRatio: '4 / 3', background: 'var(--uni-vide)' }}>
            {espece.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={espece.photo_url} alt={espece.nom} className="block h-full w-full object-cover" />
            )}
            <button onClick={onFermer} aria-label="Fermer"
              className="absolute flex items-center justify-center rounded-full border-none"
              style={{ right: 10, top: 10, width: 40, height: 40, background: 'var(--uni-panel)', color: 'var(--uni-ink)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          {espece.photo_credit && (
            <p className="m-0" style={{ padding: '6px 18px 0', fontSize: 12, color: 'var(--uni-dim)' }}>
              Photo : {espece.photo_credit}
            </p>
          )}

          <div className="flex flex-col" style={{ padding: '14px 18px 26px', gap: 16, fontSize: 16, lineHeight: 1.5 }}>
            <div>
              <PastilleStatut statut={espece.statut} />
              <h2 id="fiche-champignon-titre" className="m-0 font-alegreya"
                style={{ marginTop: 8, fontSize: 30, fontWeight: 700, lineHeight: 1.05, textWrap: 'balance' }}>
                {espece.nom}
              </h2>
              <div className="font-alegreya" style={{ fontStyle: 'italic', fontSize: 15, color: 'var(--uni-dim)' }}>
                {espece.nom_latin}
              </div>
            </div>

            <div className="flex flex-wrap" style={{ gap: '6px 14px', fontSize: 14, color: 'var(--uni-dim)' }}>
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
                            className="border-none bg-transparent p-0 font-alegreyaSans"
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
    <h3 className="m-0" style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--uni-accent)' }}>
      {children}
    </h3>
  )
}

function Encadre({ fond, couleur, titre, texte }: { fond: string; couleur: string; titre: string; texte: string }) {
  return (
    <section style={{ borderRadius: 10, padding: '12px 14px', background: fond }}>
      <h3 className="m-0" style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: couleur }}>
        {titre}
      </h3>
      <p className="m-0">{texte}</p>
    </section>
  )
}
