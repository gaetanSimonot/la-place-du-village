'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Evenement, Filtres } from '@/lib/types'
import { getDateRange } from '@/lib/filters'
import { useRouter } from 'next/navigation'

const MapView     = dynamic(() => import('@/components/MapView'),     { ssr: false })
const BottomSheet = dynamic(() => import('@/components/BottomSheet'), { ssr: false })

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }
const NAV_H = 60

export default function HomePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtres, setFiltres]       = useState<Filtres>(defaultFiltres)
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [loading, setLoading]       = useState(true)
  const [navMode, setNavMode]       = useState<'carte' | 'liste'>('carte')
  const [fabOpen, setFabOpen]       = useState(false)
  const router = useRouter()

  // Sync sheet mode with nav mode
  const sheetMode = navMode === 'carte' ? 'peek' : 'full'

  const fetchEvenements = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('evenements')
      .select('*, lieux(*)')
      .eq('statut', 'publie')
      .order('date_debut', { ascending: true })

    if (filtres.categories.length > 0) query = query.in('categorie', filtres.categories)
    const range = getDateRange(filtres.quand)
    if (range) query = query.gte('date_debut', range.from).lte('date_debut', range.to)

    const { data } = await query
    setEvenements((data as Evenement[]) ?? [])
    setLoading(false)
  }, [filtres])

  useEffect(() => { fetchEvenements() }, [fetchEvenements])

  const handleViewOnMap = (id: string) => {
    setSelectedId(id)
    setNavMode('carte')
  }

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: '#D6E4D8' }}>

      {/* Carte plein écran */}
      <div className="absolute inset-0" style={{ bottom: NAV_H }}>
        <MapView
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onOpenEvent={id => router.push(`/evenement/${id}`)}
        />
      </div>

      {/* FAB "+" — haut droite, caché en mode liste */}
      <AnimatePresence>
        {navMode === 'carte' && (
          <motion.div
            key="fab-zone"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 40 }}
          >
            {/* Backdrop */}
            <AnimatePresence>
              {fabOpen && (
                <motion.div
                  key="fab-bg"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setFabOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: -1, backgroundColor: 'rgba(0,0,0,0.2)' }}
                />
              )}
            </AnimatePresence>

            <div style={{ position: 'relative' }}>
              {/* Options */}
              <AnimatePresence>
                {fabOpen && [
                  { label: 'Photo / Affiche', icon: '📷', path: '/capturer' },
                  { label: 'Décrire en texte', icon: '✍️', path: '/ajouter' },
                ].map((opt, i) => (
                  <motion.button
                    key={opt.path}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: i * 0.05, duration: 0.16 }}
                    onClick={() => { setFabOpen(false); router.push(opt.path) }}
                    style={{
                      position: 'absolute', right: 64, top: i === 0 ? 0 : 56,
                      whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
                      backgroundColor: '#fff', border: '1px solid #EDE8E0',
                      borderRadius: 14, padding: '10px 16px',
                      fontSize: 13, fontWeight: 600, color: '#2C2C2C',
                      fontFamily: 'Inter, sans-serif',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                  </motion.button>
                ))}
              </AnimatePresence>

              {/* Bouton principal */}
              <motion.button
                animate={{ rotate: fabOpen ? 45 : 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setFabOpen(o => !o)}
                aria-label="Ajouter un événement"
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  backgroundColor: '#E8622A', color: '#fff',
                  fontSize: 28, fontWeight: 300, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 18px rgba(232,98,42,0.45)',
                  border: 'none', cursor: 'pointer',
                }}
              >+</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet */}
      <BottomSheet
        evenements={evenements}
        loading={loading}
        selectedId={selectedId}
        onSelectEvent={setSelectedId}
        onViewOnMap={handleViewOnMap}
        filtres={filtres}
        onFiltresChange={setFiltres}
        mode={sheetMode}
        navHeight={NAV_H}
      />

      {/* Bottom navigation */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: NAV_H, backgroundColor: '#fff',
        borderTop: '1px solid #EDE8E0',
        display: 'flex', zIndex: 30,
      }}>
        {([
          { id: 'carte', label: 'Carte', icon: '🗺️' },
          { id: 'liste', label: 'Liste', icon: '📋' },
        ] as const).map(tab => {
          const active = navMode === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setNavMode(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                borderTop: active ? '2px solid #E8622A' : '2px solid transparent',
                transition: 'border-color 0.15s',
              }}
            >
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: active ? '#E8622A' : '#8A8A8A',
                fontFamily: 'Inter, sans-serif',
              }}>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
