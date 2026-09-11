'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { lienHeros, herosExterne, type HerosVillage as HerosVillageType } from '@/lib/villageHero'
import { useHerosVillage } from '@/hooks/useHerosVillage'

/**
 * L'encart mis en avant, en tête du Village.
 *
 * Même gabarit que la barre de l'Assistant juste en dessous — bord doux, rayon
 * 18, image à gauche — pour que les deux se lisent comme deux cartes du même
 * jeu et non comme une bannière plaquée. Ce sont deux éléments distincts : le
 * héros ne remplace pas l'assistant, il se pose au-dessus.
 *
 * Le composant demande au serveur si le héros lui est ouvert ; il ne filtre
 * rien lui-même. Il ne porte AUCUN réglage : tout se règle dans
 * /admin/hub-carousel, où vivent déjà la visibilité de l'assistant et du
 * cinéma. Un interrupteur ici ferait un second endroit où dire la même chose,
 * et deux endroits finissent toujours par se contredire.
 */
/** Un seul encart, celui qu'on montre à cet instant. */
function Encart({ heros }: { heros: HerosVillageType }) {
  const href    = lienHeros(heros)
  const externe = herosExterne(heros)

  const corps = (
    <div
      className="flex items-stretch gap-3 overflow-hidden rounded-[18px] border bg-white"
      style={{ borderColor: '#DCE8DF', boxShadow: '0 2px 10px rgba(44,28,16,0.05)' }}
    >
      {heros.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heros.image}
          alt=""
          className="h-auto w-[104px] shrink-0 object-cover"
          style={{ minHeight: 96 }}
        />
      )}
      <div className="min-w-0 flex-1 py-3 pr-3" style={{ paddingLeft: heros.image ? 0 : 14 }}>
        <span
          className="inline-block rounded-full px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-white"
          style={{ background: '#C4622D' }}
        >
          {heros.etiquette}
        </span>
        <p className="mb-0 mt-1.5 text-[15px] font-extrabold leading-[1.2] text-texte" style={{ letterSpacing: '-0.01em' }}>
          {heros.titre}
        </p>
        {heros.sousTitre && (
          <p className="mb-0 mt-1 line-clamp-2 text-[12px] leading-[1.35]" style={{ color: '#7A6A5A' }}>
            {heros.sousTitre}
          </p>
        )}
      </div>
    </div>
  )

  return externe ? (
    // Un lien du dehors s'ouvre à côté : on ne sort pas l'habitant de
    // l'application sans qu'il puisse y revenir d'un geste.
    <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline">{corps}</a>
  ) : (
    <Link href={href} className="block no-underline">{corps}</Link>
  )
}

/** Le temps qu'une fiche reste à l'écran avant de céder la place. */
const DUREE_FICHE = 6000

export default function HerosVillage() {
  const { heros, eteint } = useHerosVillage()
  const [index, setIndex] = useState(0)

  const nombre = heros.length

  /*
   * Le défilement. Il ne s'arme qu'à partir de DEUX fiches : avec une seule,
   * un minuteur qui tourne pour rien réveillerait l'onglet toutes les six
   * secondes sans jamais rien changer.
   *
   * L'index est ramené dans les bornes à chaque changement de liste : une
   * fiche retirée en admin pendant qu'on regarde la troisième laissait sinon
   * l'encart sur un index qui n'existe plus, donc vide.
   */
  useEffect(() => {
    setIndex(i => (nombre ? i % nombre : 0))
    if (nombre < 2) return
    const t = setInterval(() => setIndex(i => (i + 1) % nombre), DUREE_FICHE)
    return () => clearInterval(t)
  }, [nombre])

  // Éteint, on n'affiche rien — même pour un admin. Le voir allumé sur son
  // téléphone se règle en mettant la visibilité sur « Admin ».
  if (!nombre || eteint) return null

  const courant = heros[index] ?? heros[0]

  return (
    <div className="px-4 pb-3 pt-1">
      {/* La clé porte l'index : React remonte l'encart à chaque passage, ce
          qui rejoue l'apparition en fondu. Sans elle, il se contenterait de
          remplacer le texte et le changement passerait inaperçu. */}
      <div key={index} className="pdv-heros-fondu">
        <Encart heros={courant} />
      </div>

      {/* Les points de position — seulement s'il y a de quoi défiler. Ils ne
          sont pas décoratifs : sans eux, on ne sait pas qu'une autre fiche
          existe, ni combien. */}
      {nombre > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {heros.map((h, i) => (
            <button
              key={`${h.titre}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Voir « ${h.titre} »`}
              aria-current={i === index}
              style={{
                width: i === index ? 16 : 6, height: 6, borderRadius: 999, border: 0,
                background: i === index ? '#2D5A3D' : '#D8CFC2',
                transition: 'width .2s, background .2s', cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
