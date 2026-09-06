'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { lienHeros, herosExterne, type HerosVillage } from '@/lib/villageHero'

/**
 * Le héros repris à la une, en bandeau au bas de la carte.
 *
 * Même emplacement et même gabarit que le bandeau des événements mis en avant,
 * dont il prend la place quand il est actif : deux bandeaux empilés au bas
 * d'une carte, c'est un de trop, et le héros est justement ce qu'on a décidé
 * de faire passer devant.
 *
 * Il ne s'affiche que si le héros porte « aussi à la une » ET qu'il est ouvert
 * à cette personne — c'est le serveur qui tranche, ici on ne fait qu'afficher.
 */
export default function BandeauHerosCarte() {
  const [heros, setHeros] = useState<HerosVillage | null>(null)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/village-hero', {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: 'no-store',
        })
        const j = await r.json().catch(() => null)
        if (annule) return
        // `eteint` : l'admin le reçoit pour pouvoir le rallumer depuis le
        // Village, mais on ne le pose pas sur la carte pour autant.
        if (j?.heros && !j?.eteint && j.heros.surCarte) setHeros(j.heros)
      } catch { /* pas de bandeau, pas de bruit */ }
    })()
    return () => { annule = true }
  }, [])

  if (!heros) return null

  const href    = lienHeros(heros)
  const externe = herosExterne(heros)

  const corps = (
    <div
      className="flex items-center gap-2.5 overflow-hidden rounded-r-[16px] bg-white pr-3"
      style={{ boxShadow: '0 4px 18px rgba(44,28,16,0.16)', borderTop: '1px solid #EFE7DA', borderRight: '1px solid #EFE7DA', borderBottom: '1px solid #EFE7DA' }}
    >
      {heros.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heros.image} alt="" className="h-[62px] w-[62px] shrink-0 object-cover" />
      ) : (
        <div className="h-[62px] w-[10px] shrink-0" style={{ background: '#C4622D' }} />
      )}
      <div className="min-w-0 flex-1 py-2">
        <span
          className="inline-block rounded-full px-[7px] py-[2px] text-[8.5px] font-extrabold uppercase tracking-[0.09em] text-white"
          style={{ background: '#C4622D' }}
        >
          {heros.etiquette}
        </span>
        <p className="mb-0 mt-1 truncate text-[12.5px] font-extrabold leading-[1.2] text-texte">
          {heros.titre}
        </p>
      </div>
    </div>
  )

  return externe
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline">{corps}</a>
    : <Link href={href} className="block no-underline">{corps}</Link>
}
