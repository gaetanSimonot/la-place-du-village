'use client'
import { useEffect, useState } from 'react'
import { lireConfigsClient } from '@/lib/configClient'
import {
  BANDEAU_THEME,
  CLE_THEME,
  garderThemeEnCache,
  lireThemeEnCache,
  parseTheme,
  type ThemeSaisonnier,
} from '@/lib/themeSaisonnier'

/**
 * Lecture de la base UNE fois par lancement : chaque page monte sa propre
 * barre du bas, et donc son propre bandeau — sans ce partage, chaque
 * changement d'onglet relirait la config.
 */
let lecture: Promise<ThemeSaisonnier> | null = null
function lireTheme(): Promise<ThemeSaisonnier> {
  if (!lecture) {
    lecture = lireConfigsClient([CLE_THEME], null, true)
      .then(c => parseTheme(c[CLE_THEME]))
      .catch(() => lireThemeEnCache())
  }
  return lecture
}

const EVT_THEME = 'lpv:theme-saisonnier'

/** L'admin vient de changer le thème : ce téléphone le montre tout de suite. */
export function appliquerTheme(t: ThemeSaisonnier): void {
  garderThemeEnCache(t)
  lecture = Promise.resolve(t)
  window.dispatchEvent(new CustomEvent<ThemeSaisonnier>(EVT_THEME, { detail: t }))
}

/**
 * Le thème courant. `null` au premier rendu (serveur comme navigateur, pas
 * de décalage d'hydratation), puis le cache du téléphone, puis la base.
 */
export function useThemeSaisonnier(): ThemeSaisonnier | null {
  const [theme, setTheme] = useState<ThemeSaisonnier | null>(null)
  useEffect(() => {
    let vivant = true
    setTheme(lireThemeEnCache())
    lireTheme().then(t => {
      garderThemeEnCache(t)
      if (vivant) setTheme(t)
    })
    const surChangement = (e: Event) => setTheme((e as CustomEvent<ThemeSaisonnier>).detail)
    window.addEventListener(EVT_THEME, surChangement)
    return () => { vivant = false; window.removeEventListener(EVT_THEME, surChangement) }
  }, [])
  return theme
}

/**
 * Le bandeau de saison, posé juste au-dessus de la barre du bas et DEVANT le
 * contenu de la page. Il ne prend aucun toucher (pointer-events: none) : ce
 * qu'il recouvre reste cliquable. Caché sur ordinateur avec la barre
 * (pcv-hide).
 */
export default function BandeauSaisonnier({ bas }: { bas: number }) {
  const theme = useThemeSaisonnier()
  const src = theme ? BANDEAU_THEME[theme] : undefined
  if (!src) return null
  return (
    <div aria-hidden className="pcv-hide" style={{
      position: 'fixed', left: 0, right: 0, bottom: bas, zIndex: 49,
      pointerEvents: 'none', lineHeight: 0,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{
        display: 'block', width: '100%', maxHeight: 130,
        objectFit: 'cover', objectPosition: 'center bottom',
      }} />
    </div>
  )
}
