'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { lienHeros, herosExterne, type HerosVillage, type PublicHeros } from '@/lib/villageHero'

/**
 * L'encart mis en avant, en tête du Village.
 *
 * Même gabarit que la barre de l'Assistant juste au-dessus — bord doux, rayon
 * 18, image à gauche — pour que les deux se lisent comme deux cartes du même
 * jeu et non comme une bannière plaquée. Ce sont deux éléments distincts : le
 * héros ne remplace pas l'assistant, il se pose au-dessus.
 *
 * Le composant demande au serveur si le héros lui est ouvert ; il ne filtre
 * rien lui-même. Éteint, il ne s'affiche que pour un admin, réduit à une ligne
 * — de quoi savoir qu'il existe et le rallumer, sans occuper la page.
 */
export default function HerosVillage() {
  const [heros, setHeros]   = useState<HerosVillage | null>(null)
  const [eteint, setEteint] = useState(false)
  const [admin, setAdmin]   = useState(false)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/village-hero', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store',
      })
      const j = await r.json().catch(() => null)
      setHeros(j?.heros ?? null)
      setEteint(!!j?.eteint)
      setAdmin(!!j?.estAdmin || !!j?.eteint)
    } catch { /* l'encart reste simplement absent */ }
  }, [])

  useEffect(() => { charger() }, [charger])

  /** Bascule tous ⇄ rien depuis la page elle-même, sans passer par l'admin. */
  const basculer = async () => {
    if (!heros || occupe) return
    setOccupe(true)
    const suivant: PublicHeros = eteint ? 'tous' : 'masque'
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ key: 'village_hero', value: JSON.stringify({ ...heros, public: suivant }) }),
      })
      await charger()
    } finally { setOccupe(false) }
  }

  if (!heros) return null

  // Éteint : seul un admin arrive ici (le serveur ne l'envoie qu'à lui).
  if (eteint) {
    return (
      <div className="px-4 pb-2 pt-1">
        <button
          type="button"
          onClick={basculer}
          disabled={occupe}
          className="flex w-full items-center gap-2 rounded-[14px] border border-dashed px-3 py-2 text-left"
          style={{ borderColor: '#DCD3C4', background: '#FBF7F0', cursor: 'pointer' }}
        >
          <span className="text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: '#9E9089' }}>
            Héros éteint
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: '#7A6A5A' }}>
            {heros.titre}
          </span>
          <span className="shrink-0 text-[11.5px] font-bold" style={{ color: '#2D5A3D' }}>
            {occupe ? '…' : 'Allumer'}
          </span>
        </button>
      </div>
    )
  }

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

      {admin && (
        <button
          type="button"
          onClick={basculer}
          disabled={occupe}
          className="mt-1.5 border-none bg-transparent p-0 text-[11.5px] font-bold"
          style={{ color: '#9E9089', cursor: 'pointer' }}
        >
          {occupe ? '…' : 'Éteindre le héros'}
        </button>
      )}
    </div>
  )
}
