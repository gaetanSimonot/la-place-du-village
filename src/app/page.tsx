'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Evenement, Filtres } from '@/lib/types'
import { getDateRange } from '@/lib/filters'
import FilterBar from '@/components/FilterBar'
import ListView from '@/components/ListView'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'carte' | 'liste'>('carte')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtres, setFiltres] = useState<Filtres>(defaultFiltres)
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvenements = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('evenements')
      .select('*, lieux(*)')
      .eq('statut', 'publie')
      .order('date_debut', { ascending: true })

    if (filtres.categories.length > 0) {
      query = query.in('categorie', filtres.categories)
    }

    const range = getDateRange(filtres.quand)
    if (range) {
      query = query.gte('date_debut', range.from).lte('date_debut', range.to)
    }

    const { data } = await query
    setEvenements((data as Evenement[]) ?? [])
    setLoading(false)
  }, [filtres])

  useEffect(() => {
    fetchEvenements()
  }, [fetchEvenements])

  const handleSelectEvent = (id: string) => {
    setSelectedId(id)
    setActiveTab('liste')
  }

  return (
    <div className="flex flex-col h-screen bg-[#FBF7F0] overflow-hidden">
      <FilterBar filtres={filtres} onChange={setFiltres} />

      <main className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'carte' ? (
          <MapView
            evenements={evenements}
            selectedId={selectedId}
            onSelectEvent={handleSelectEvent}
          />
        ) : (
          <ListView
            evenements={evenements}
            selectedId={selectedId}
            onSelectEvent={setSelectedId}
          />
        )}

        {/* FAB */}
        <Link
          href="/ajouter"
          className="absolute bottom-4 right-4 w-14 h-14 bg-[#C4622D] rounded-full flex items-center justify-center shadow-lg text-white text-3xl font-light hover:bg-[#A8521E] transition-colors z-10"
          aria-label="Ajouter un événement"
        >
          +
        </Link>
      </main>

      {/* Onglets bas */}
      <nav className="flex border-t border-[#E8E0D5] bg-white shrink-0">
        {(['carte', 'liste'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs font-semibold transition-colors ${
              activeTab === tab
                ? 'text-[#C4622D]'
                : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{tab === 'carte' ? '🗺️' : '📋'}</span>
            {tab === 'carte' ? 'Carte' : 'Liste'}
            {activeTab === tab && (
              <span className="absolute bottom-0 w-16 h-0.5 bg-[#C4622D] rounded-t-full" />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
