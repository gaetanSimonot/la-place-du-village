'use client'
import dynamic from 'next/dynamic'
import { memo, type ComponentProps } from 'react'
import type MapViewMaplibreT from '@/components/MapViewMaplibre'

// Chaque carte est chargée à la demande (code-splitting) : MapLibre n'est
// embarqué que si le provider est 'maplibre', et inversement pour Google.
const GoogleMap   = dynamic(() => import('@/components/MapView'),          { ssr: false })
const MaplibreMap = dynamic(() => import('@/components/MapViewMaplibre'),  { ssr: false })

type MapProps = ComponentProps<typeof MapViewMaplibreT>
// Le provider est GLOBAL (config.map_provider, piloté par l'admin) — pas un
// réglage par utilisateur. Il est fourni en prop par la page.
type Props = MapProps & { provider: 'google' | 'maplibre' }

function MapViewSwitch({ provider, ...mapProps }: Props) {
  return provider === 'maplibre' ? <MaplibreMap {...mapProps} /> : <GoogleMap {...mapProps} />
}

/*
 * Mémoïsée : la page d'accueil se rend à chaque changement d'onglet, de
 * hauteur de feuille, de défilement… et la carte, de loin le composant le
 * plus lourd, suivait à chaque fois. Elle ne se recalcule plus que si l'une
 * de SES propriétés change. Ce qui suppose des propriétés stables côté page :
 * fonctions en useCallback, listes vides partagées (AUCUN_EVENEMENT…).
 */
export default memo(MapViewSwitch)
