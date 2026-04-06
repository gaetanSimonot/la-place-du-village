'use client'
import { useEffect, useRef } from 'react'
import { Evenement } from '@/lib/types'
import EventCard from './EventCard'

interface Props {
  evenements: Evenement[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
}

export default function ListView({ evenements, selectedId, onSelectEvent }: Props) {
  const selectedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedId])

  if (evenements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <p className="text-5xl mb-4">🏡</p>
        <p className="font-bold text-[#2C1810] text-lg">Aucun événement</p>
        <p className="text-gray-500 text-sm mt-1">
          Modifie tes filtres ou ajoute un événement !
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 grid gap-3 pb-6">
        {evenements.map(evt => (
          <div key={evt.id} ref={evt.id === selectedId ? selectedRef : null}>
            <EventCard
              evenement={evt}
              isSelected={evt.id === selectedId}
              onClick={() => onSelectEvent(evt.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
