'use client'
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/swr-fetchers'
import {
  COLOR_THEMES, MAP_STYLES, SHEET_BG_OPTIONS,
  DEFAULT_COLOR_THEME, DEFAULT_MAP_STYLE, DEFAULT_SHEET_BG,
  ColorTheme, MapStyleDef, SheetBg,
} from '@/lib/themes'

/**
 * Le STYLE DE CARTE est un reglage GLOBAL, pas une preference d'appareil.
 *
 * Les couleurs, le fond de liste et la carte fixe restent personnels : ils ne
 * regardent que celui qui les choisit. Le style de carte, lui, decide de ce que
 * la carte MONTRE — les batiments, le contraste des rues — donc de la lisibilite
 * pour tout le monde. Il vit dans `config`, a cote de `map_provider`, et seul un
 * admin l'ecrit (la route PATCH est gardee par requireAdmin).
 *
 * Consequence voulue : un choix fait avant cette bascule, garde en localStorage,
 * n'est plus relu. Sinon l'admin changerait le style et ne verrait rien bouger
 * sur son propre telephone — exactement le piege deja vecu avec la zone.
 */
const CLE_CONFIG_STYLE = 'map_style'

interface ThemeCtx {
  colorTheme: ColorTheme
  mapStyle: MapStyleDef
  sheetBg: SheetBg
  fixedMap: boolean
  setColorThemeId: (id: string) => void
  setMapStyleId: (id: string) => void
  setSheetBgId: (id: string) => void
  setFixedMap: (v: boolean) => void
}

export const ThemeContext = createContext<ThemeCtx>({
  colorTheme: COLOR_THEMES[0],
  mapStyle: MAP_STYLES[0],
  sheetBg: SHEET_BG_OPTIONS[0],
  fixedMap: false,
  setColorThemeId: () => {},
  setMapStyleId: () => {},
  setSheetBgId: () => {},
  setFixedMap: () => {},
})

export function useTheme() { return useContext(ThemeContext) }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorId,   setColorId]   = useState(DEFAULT_COLOR_THEME)
  const [mapId,     setMapId]     = useState(DEFAULT_MAP_STYLE)
  const [sheetBgId, setSheetBgIdState] = useState(DEFAULT_SHEET_BG)
  const [fixedMap,  setFixedMapState]  = useState(false)
  /** Miroir du style courant, pour revenir en arriere si l'ecriture echoue. */
  const mapIdRef = useRef(mapId)
  useEffect(() => { mapIdRef.current = mapId }, [mapId])

  useEffect(() => {
    const c = localStorage.getItem('pdv-theme-color')
    const s = localStorage.getItem('pdv-theme-sheetbg')
    const f = localStorage.getItem('pdv-theme-fixedmap')
    // Migrate old default 'terrecuite' → new default 'foret'
    const colorToApply = c === 'terrecuite' ? DEFAULT_COLOR_THEME : c
    if (colorToApply && COLOR_THEMES.some(t => t.id === colorToApply)) setColorId(colorToApply)
    if (s && SHEET_BG_OPTIONS.some(o => o.id === s))    setSheetBgIdState(s)
    if (f !== null) setFixedMapState(f === 'true')
  }, [])

  // Le style de carte vient de la config globale. Lecture directe Supabase et
  // non fetch('/api/…') : le service worker peut intercepter les routes API.
  useEffect(() => {
    let vivant = true
    supabase.from('config').select('value').eq('key', CLE_CONFIG_STYLE).maybeSingle()
      .then(({ data }) => {
        const id = data?.value
        if (vivant && id && MAP_STYLES.some(s => s.id === id)) setMapId(id)
      })
    return () => { vivant = false }
  }, [])

  const colorTheme = COLOR_THEMES.find(t => t.id === colorId)         ?? COLOR_THEMES[0]
  const mapStyle   = MAP_STYLES.find(s => s.id === mapId)             ?? MAP_STYLES[0]
  const sheetBg    = SHEET_BG_OPTIONS.find(o => o.id === sheetBgId)   ?? SHEET_BG_OPTIONS[0]

  useEffect(() => {
    const el = document.documentElement
    el.style.setProperty('--primary',       colorTheme.primary)
    el.style.setProperty('--primary-light', colorTheme.primaryLight)
    el.style.setProperty('--creme',         colorTheme.bg)
    el.style.setProperty('--sheet-bg',      sheetBg.bg)
    el.style.setProperty('--sheet-text',    sheetBg.text)
    el.style.setProperty('--sheet-sub',     sheetBg.sub)
    el.style.setProperty('--sheet-border',  sheetBg.border)
    el.style.setProperty('--sheet-pill',    sheetBg.pill)
    el.style.setProperty('--sheet-pill-text', sheetBg.pillText)
  }, [colorTheme, sheetBg])

  const setColorThemeId = useCallback((id: string) => {
    setColorId(id)
    localStorage.setItem('pdv-theme-color', id)
  }, [])

  /**
   * Ecrit le style pour TOUT LE MONDE. Reserve aux admins — la route refuse les
   * autres, et l'UI ne propose le choix qu'a eux.
   *
   * On applique d'abord, on enregistre ensuite : l'admin voit le rendu tout de
   * suite. Si l'ecriture echoue on revient en arriere ET on le dit, plutot que
   * de laisser croire que c'est enregistre.
   */
  const setMapStyleId = useCallback((id: string) => {
    const precedent = mapIdRef.current
    if (precedent === id) return
    setMapId(id)
    const echec = () => { setMapId(precedent); toast.error('Style non enregistre') }
    authedFetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: CLE_CONFIG_STYLE, value: id }),
    })
      .then(res => { if (!res.ok) echec() })
      .catch(echec)
  }, [])

  const setSheetBgId = useCallback((id: string) => {
    setSheetBgIdState(id)
    localStorage.setItem('pdv-theme-sheetbg', id)
  }, [])

  const setFixedMap = useCallback((v: boolean) => {
    setFixedMapState(v)
    localStorage.setItem('pdv-theme-fixedmap', String(v))
  }, [])

  return (
    <ThemeContext.Provider value={{ colorTheme, mapStyle, sheetBg, fixedMap, setColorThemeId, setMapStyleId, setSheetBgId, setFixedMap }}>
      {children}
    </ThemeContext.Provider>
  )
}
