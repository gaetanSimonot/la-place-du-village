'use client'
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import type MapViewMaplibreT from '@/components/MapViewMaplibre'

// Chaque carte est chargée à la demande (code-splitting) : MapLibre n'est
// embarqué que si le provider est 'maplibre', et inversement pour Google.
const GoogleMap   = dynamic(() => import('@/components/MapView'),          { ssr: false })
const MaplibreMap = dynamic(() => import('@/components/MapViewMaplibre'),  { ssr: false })

type Props = ComponentProps<typeof MapViewMaplibreT>

export default function MapViewSwitch(props: Props) {
  const { mapProvider } = useTheme()
  return mapProvider === 'maplibre' ? <MaplibreMap {...props} /> : <GoogleMap {...props} />
}
