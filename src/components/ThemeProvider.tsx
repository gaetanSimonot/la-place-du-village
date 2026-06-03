'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  COLOR_THEMES, MAP_STYLES, SHEET_BG_OPTIONS,
  DEFAULT_COLOR_THEME, DEFAULT_MAP_STYLE, DEFAULT_SHEET_BG,
  ColorTheme, MapStyleDef, SheetBg,
} from '@/lib/themes'

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

  useEffect(() => {
    const c = localStorage.getItem('pdv-theme-color')
    const m = localStorage.getItem('pdv-theme-map')
    const s = localStorage.getItem('pdv-theme-sheetbg')
    const f = localStorage.getItem('pdv-theme-fixedmap')
    // Migrate old default 'terrecuite' → new default 'foret'
    const colorToApply = c === 'terrecuite' ? DEFAULT_COLOR_THEME : c
    if (colorToApply && COLOR_THEMES.some(t => t.id === colorToApply)) setColorId(colorToApply)
    if (m && MAP_STYLES.some(s => s.id === m))          setMapId(m)
    if (s && SHEET_BG_OPTIONS.some(o => o.id === s))    setSheetBgIdState(s)
    if (f !== null) setFixedMapState(f === 'true')
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

  const setMapStyleId = useCallback((id: string) => {
    setMapId(id)
    localStorage.setItem('pdv-theme-map', id)
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
