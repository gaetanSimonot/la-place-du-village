'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { lireConfigsClient } from '@/lib/configClient'
import { parseVisibilite, sectionVisible, type Visibilite } from '@/lib/visibilite'
import { useTerritoire } from '@/components/TerritoireProvider'

/**
 * L'icône météo, à droite du grand titre « Aujourd'hui / près de chez vous ».
 * Une porte vers la page /meteo, pilotée comme les blocs du Village par la
 * clé `meteo_village_public` (masqué / admin / tous, réglée dans
 * /admin/hub-carousel). Défaut `admin` : on la rode avant de l'ouvrir.
 */
export default function MeteoRaccourci({ isAdmin, surTheme = false }: { isAdmin: boolean; surTheme?: boolean }) {
  const { territoire } = useTerritoire()
  const [vis, setVis] = useState<Visibilite | null>(null)

  useEffect(() => {
    let vivant = true
    lireConfigsClient(['meteo_village_public'], territoire?.id ?? null, !!territoire?.par_defaut || !territoire)
      .then(c => { if (vivant) setVis(parseVisibilite(c.meteo_village_public)) })
      .catch(() => { if (vivant) setVis('admin') })
    return () => { vivant = false }
  }, [territoire])

  if (!vis || !sectionVisible(vis, isAdmin)) return null

  const trait = surTheme ? '#FFFFFF' : '#2D5A3D'
  return (
    <Link
      href="/meteo"
      aria-label="La météo"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full no-underline"
      style={{
        background: surTheme ? 'rgba(255,255,255,0.14)' : '#FFFFFF',
        border: surTheme ? '1px solid rgba(255,255,255,0.45)' : '1px solid #EDE8E0',
        boxShadow: surTheme ? 'none' : '0 2px 10px rgba(44,28,16,.08)',
        color: trait,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Soleil voilé : trait seul, même épaisseur que les icônes de la barre. */}
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2v2" />
        <path d="M4.93 4.93l1.41 1.41" />
        <path d="M20 12h2" />
        <path d="M19.07 4.93l-1.41 1.41" />
        <path d="M15.95 12.65a4 4 0 0 0-5.92-4.33" />
        <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z" />
      </svg>
    </Link>
  )
}
