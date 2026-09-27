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
      className="flex flex-1 items-stretch gap-3 overflow-hidden rounded-[18px] border bg-white"
      style={{ borderColor: '#DCE8DF', boxShadow: '0 2px 10px rgba(44,28,16,0.05)' }}
    >
      {/* L'image ne donne PAS la hauteur : elle est posée en absolu dans son
          cadre et recadrée. Seul le texte fait grandir la carte — une affiche
          verticale l'étirait en colonne. */}
      {heros.image && (
        <div className="relative w-[104px] shrink-0" style={{ minHeight: 96 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heros.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
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
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex flex-1 flex-col no-underline">{corps}</a>
  ) : (
    <Link href={href} className="flex flex-1 flex-col no-underline">{corps}</Link>
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

  return (
    <div className="px-4 pb-3 pt-1">
      {/* FONDU ENCHAÎNÉ. Toutes les fiches sont posées dans la MÊME case de
          grille, l'une sur l'autre ; seule l'opacité change. Avant, l'encart
          était remonté à chaque passage : l'ancienne fiche disparaissait d'un
          coup, la nouvelle arrivait avec une autre hauteur et une image pas
          encore chargée — ça claquait.
          Ici la hauteur est celle de la plus haute fiche, fixe pendant tout le
          défilement, et les images sont chargées dès le départ. */}
      <div className="grid">
        {heros.map((h, i) => (
          <div
            key={`${h.titre}-${i}`}
            className="pdv-heros-fiche flex flex-col"
            aria-hidden={i !== index}
            style={{
              gridArea: '1 / 1',
              opacity: i === index ? 1 : 0,
              pointerEvents: i === index ? 'auto' : 'none',
              zIndex: i === index ? 1 : 0,
            }}
          >
            <Encart heros={h} />
          </div>
        ))}
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
