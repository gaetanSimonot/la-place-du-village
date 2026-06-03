'use client'
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type MapViewMaplibreT from '@/components/MapViewMaplibre'

// Chaque carte est chargée à la demande (code-splitting) : MapLibre n'est
// embarqué que si le provider est 'maplibre', et inversement pour Google.
const GoogleMap   = dynamic(() => import('@/components/MapView'),          { ssr: false })
const MaplibreMap = dynamic(() => import('@/components/MapViewMaplibre'),  { ssr: false })

type MapProps = ComponentProps<typeof MapViewMaplibreT>
// Le provider est GLOBAL (config.map_provider, piloté par l'admin) — pas un
// réglage par utilisateur. Il est fourni en prop par la page.
type Props = MapProps & { provider: 'google' | 'maplibre' }

export default function MapViewSwitch({ provider, ...mapProps }: Props) {
  return provider === 'maplibre' ? <MaplibreMap {...mapProps} /> : <GoogleMap {...mapProps} />
}
