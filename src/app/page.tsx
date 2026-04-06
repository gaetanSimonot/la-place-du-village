'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
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
  const [fabOpen, setFabOpen] = useState(false)
  const router = useRouter()

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

        {/* Backdrop fermeture menu */}
        {fabOpen && (
          <div className="absolute inset-0 z-10" onClick={() => setFabOpen(false)} />
        )}

        {/* Mini-menu FAB */}
        {fabOpen && (
          <div className="absolute bottom-20 right-4 z-20 flex flex-col gap-2 items-end">
            <button
              onClick={() => { setFabOpen(false); router.push('/capturer') }}
              className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-lg border border-[#E8E0D5] text-[#2C1810] font-semibold text-sm whitespace-nowrap"
            >
              📷 Photo / Affiche
            </button>
            <button
              onClick={() => { setFabOpen(false); router.push('/ajouter') }}
              className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-lg border border-[#E8E0D5] text-[#2C1810] font-semibold text-sm whitespace-nowrap"
            >
              ✍️ Décrire en texte
            </button>
          </div>
        )}

        {/* FAB */}
        <button
          onClick={() => setFabOpen(o => !o)}
          className={`absolute bottom-4 right-4 w-14 h-14 bg-[#C4622D] rounded-full flex items-center justify-center shadow-lg text-white text-3xl font-light transition-all z-20 ${fabOpen ? 'rotate-45' : ''}`}
          aria-label="Ajouter un événement"
        >
          +
        </button>
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
