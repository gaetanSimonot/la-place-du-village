'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  COLOR_THEMES, MAP_STYLES,
  DEFAULT_COLOR_THEME, DEFAULT_MAP_STYLE,
  ColorTheme, MapStyleDef,
} from '@/lib/themes'

interface ThemeCtx {
  colorTheme: ColorTheme
  mapStyle: MapStyleDef
  setColorThemeId: (id: string) => void
  setMapStyleId: (id: string) => void
}

export const ThemeContext = createContext<ThemeCtx>({
  colorTheme: COLOR_THEMES[0],
  mapStyle: MAP_STYLES[0],
  setColorThemeId: () => {},
  setMapStyleId: () => {},
})

export function useTheme() { return useContext(ThemeContext) }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorId, setColorId] = useState(DEFAULT_COLOR_THEME)
  const [mapId,   setMapId]   = useState(DEFAULT_MAP_STYLE)

  useEffect(() => {
    const c = localStorage.getItem('pdv-theme-color')
    const m = localStorage.getItem('pdv-theme-map')
    if (c && COLOR_THEMES.some(t => t.id === c)) setColorId(c)
    if (m && MAP_STYLES.some(s => s.id === m))   setMapId(m)
  }, [])

  const colorTheme = COLOR_THEMES.find(t => t.id === colorId) ?? COLOR_THEMES[0]
  const mapStyle   = MAP_STYLES.find(s => s.id === mapId)     ?? MAP_STYLES[0]

  useEffect(() => {
    const el = document.documentElement
    el.style.setProperty('--primary',       colorTheme.primary)
    el.style.setProperty('--primary-light', colorTheme.primaryLight)
    el.style.setProperty('--creme',         colorTheme.bg)
  }, [colorTheme])

  const setColorThemeId = useCallback((id: string) => {
    setColorId(id)
    localStorage.setItem('pdv-theme-color', id)
  }, [])

  const setMapStyleId = useCallback((id: string) => {
    setMapId(id)
    localStorage.setItem('pdv-theme-map', id)
  }, [])

  return (
    <ThemeContext.Provider value={{ colorTheme, mapStyle, setColorThemeId, setMapStyleId }}>
      {children}
    </ThemeContext.Provider>
  )
}
