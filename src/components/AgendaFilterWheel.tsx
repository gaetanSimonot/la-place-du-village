'use client'
import { useMemo } from 'react'
import { WheelPicker, WheelPickerWrapper } from '@ncdai/react-wheel-picker'
import '@ncdai/react-wheel-picker/style.css'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie, FiltreQuand, Filtres } from '@/lib/types'

const CATS = Object.keys(CATEGORIES) as Categorie[]

const QUAND_OPTIONS: { value: FiltreQuand; label: string }[] = [
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_week_end',   label: 'Ce week-end' },
  { value: 'ce_mois',       label: 'Ce mois' },
]

const TOUT_ID = '__tout' as const

interface Props {
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  /** Callback optionnel à chaque changement (ex : snap sheet à half) */
  onChange?: () => void
}

export default function AgendaFilterWheel({ filtres, onFiltresChange, onChange }: Props) {
  // Options 'Tout' en première position. Le picker du package retourne
  // la value de l'option sélectionnée — on map vers le filtre métier.
  const quoiOptions = useMemo(() => [
    { value: TOUT_ID as string, label: 'Tout' },
    ...CATS.map(id => ({ value: id as string, label: CATEGORIES[id].label })),
  ], [])

  const quandOptions = useMemo(() => [
    { value: TOUT_ID as string, label: 'Tout' },
    ...QUAND_OPTIONS.map(o => ({ value: o.value as string, label: o.label })),
  ], [])

  const quoiValue: string = filtres.categories[0] ?? TOUT_ID
  const quandValue: string = filtres.quand === 'toujours' ? TOUT_ID : filtres.quand

  const handleQuoiChange = (v: string) => {
    if (v === TOUT_ID) onFiltresChange({ ...filtres, categories: [] })
    else onFiltresChange({ ...filtres, categories: [v as Categorie] })
    onChange?.()
  }

  const handleQuandChange = (v: string) => {
    if (v === TOUT_ID) onFiltresChange({ ...filtres, quand: 'toujours' })
    else onFiltresChange({ ...filtres, quand: v as FiltreQuand })
    onChange?.()
  }

  return (
    <WheelPickerWrapper className="pdv-wheel-wrapper">
      <WheelPicker
        options={quoiOptions}
        value={quoiValue}
        onValueChange={handleQuoiChange}
        infinite
        visibleCount={8}
        optionItemHeight={32}
        classNames={{
          optionItem:       'pdv-wp-item',
          highlightWrapper: 'pdv-wp-highlight',
          highlightItem:    'pdv-wp-highlight-item',
        }}
      />
      <WheelPicker
        options={quandOptions}
        value={quandValue}
        onValueChange={handleQuandChange}
        infinite
        visibleCount={8}
        optionItemHeight={32}
        classNames={{
          optionItem:       'pdv-wp-item',
          highlightWrapper: 'pdv-wp-highlight',
          highlightItem:    'pdv-wp-highlight-item',
        }}
      />
    </WheelPickerWrapper>
  )
}
