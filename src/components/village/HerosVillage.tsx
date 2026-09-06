'use client'
import Link from 'next/link'
import { lienHeros, herosExterne } from '@/lib/villageHero'
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
export default function HerosVillage() {
  const { heros, eteint } = useHerosVillage()

  // Éteint, on n'affiche rien — même pour un admin. Le voir allumé sur son
  // téléphone se règle en mettant la visibilité sur « Admin ».
  if (!heros || eteint) return null

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

  return (
    <div className="px-4 pb-3 pt-1">
      {externe ? (
        // Un lien du dehors s'ouvre à côté : on ne sort pas l'habitant de
        // l'application sans qu'il puisse y revenir d'un geste.
        <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline">{corps}</a>
      ) : (
        <Link href={href} className="block no-underline">{corps}</Link>
      )}
    </div>
  )
}
