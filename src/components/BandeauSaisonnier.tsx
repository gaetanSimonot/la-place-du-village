'use client'
import { useEffect, useState } from 'react'
import { lireConfigsClient } from '@/lib/configClient'
import {
  BANDEAU_THEME,
  CLE_BANDEAU,
  CLE_THEME,
  garderBandeauEnCache,
  garderThemeEnCache,
  lireBandeauEnCache,
  lireThemeEnCache,
  parseBandeau,
  parseTheme,
  type ThemeSaisonnier,
} from '@/lib/themeSaisonnier'

/**
 * Lecture de la base UNE fois par lancement : chaque page monte sa propre
 * barre du bas, et donc son propre bandeau — sans ce partage, chaque
 * changement d'onglet relirait la config.
 */
let lecture: Promise<Record<string, string | null>> | null = null
function lireReglages(): Promise<Record<string, string | null>> {
  if (!lecture) {
    lecture = lireConfigsClient([CLE_THEME, CLE_BANDEAU], null, true)
      .catch(() => ({}) as Record<string, string | null>)
  }
  return lecture
}

const EVT_THEME = 'lpv:theme-saisonnier'
const EVT_BANDEAU = 'lpv:theme-bandeau'

/** L'admin vient de changer le thème : ce téléphone le montre tout de suite. */
export function appliquerTheme(t: ThemeSaisonnier): void {
  garderThemeEnCache(t)
  lecture = lireReglages().then(c => ({ ...c, [CLE_THEME]: t }))
  window.dispatchEvent(new CustomEvent<ThemeSaisonnier>(EVT_THEME, { detail: t }))
}

/** L'admin vient d'afficher ou de masquer le bandeau. */
export function appliquerBandeau(b: boolean): void {
  garderBandeauEnCache(b)
  lecture = lireReglages().then(c => ({ ...c, [CLE_BANDEAU]: b ? 'on' : 'off' }))
  window.dispatchEvent(new CustomEvent<boolean>(EVT_BANDEAU, { detail: b }))
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
    lireReglages().then(c => {
      const t = CLE_THEME in c ? parseTheme(c[CLE_THEME]) : lireThemeEnCache()
      garderThemeEnCache(t)
      if (vivant) setTheme(t)
    })
    const surChangement = (e: Event) => setTheme((e as CustomEvent<ThemeSaisonnier>).detail)
    window.addEventListener(EVT_THEME, surChangement)
    return () => { vivant = false; window.removeEventListener(EVT_THEME, surChangement) }
  }, [])
  return theme
}

/** Bandeau affiché ou non (réglage admin). `false` au premier rendu. */
function useBandeauVisible(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let vivant = true
    setVisible(lireBandeauEnCache())
    lireReglages().then(c => {
      const b = CLE_BANDEAU in c ? parseBandeau(c[CLE_BANDEAU]) : lireBandeauEnCache()
      garderBandeauEnCache(b)
      if (vivant) setVisible(b)
    })
    const surChangement = (e: Event) => setVisible((e as CustomEvent<boolean>).detail)
    window.addEventListener(EVT_BANDEAU, surChangement)
    return () => { vivant = false; window.removeEventListener(EVT_BANDEAU, surChangement) }
  }, [])
  return visible
}

/**
 * Le bandeau de saison, posé juste au-dessus de la barre du bas et DEVANT le
 * contenu de la page. Il ne prend aucun toucher (pointer-events: none) : ce
 * qu'il recouvre reste cliquable. Caché sur ordinateur avec la barre
 * (pcv-hide).
 */
export default function BandeauSaisonnier({ bas }: { bas: number }) {
  const theme = useThemeSaisonnier()
  const visible = useBandeauVisible()
  const src = theme && visible ? BANDEAU_THEME[theme] : undefined
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
