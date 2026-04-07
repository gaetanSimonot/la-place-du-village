'use client'
import React from 'react'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Evenement, Filtres } from '@/lib/types'
import { getDateRange } from '@/lib/filters'
import { useTheme } from '@/components/ThemeProvider'

const MapView     = dynamic(() => import('@/components/MapView'),     { ssr: false })
const BottomSheet = dynamic(() => import('@/components/BottomSheet'), { ssr: false })

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }
const NAV_H = 62

type NavTab = 'carte' | 'liste' | 'profil'

const IconCarte = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/>
    <line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
)
const IconListe = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="9" y1="6" x2="20" y2="6"/>
    <line x1="9" y1="12" x2="20" y2="12"/>
    <line x1="9" y1="18" x2="20" y2="18"/>
    <circle cx="4.5" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="4.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="4.5" cy="18" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
)
const IconProfil = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)

const NAV_TABS: { id: NavTab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'carte',  label: 'Carte',  Icon: IconCarte  },
  { id: 'liste',  label: 'Liste',  Icon: IconListe  },
  { id: 'profil', label: 'Profil', Icon: IconProfil },
]

export default function HomePage() {
  const { fixedMap, setFixedMap } = useTheme()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtres, setFiltres]       = useState<Filtres>(defaultFiltres)
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [loading, setLoading]       = useState(true)
  const [sheetMode, setSheetMode]   = useState<'peek'|'half'|'full'>('half')
  const [navTab, setNavTab]         = useState<NavTab>('carte')
  const [fabOpen, setFabOpen]       = useState(false)
  const router = useRouter()

  const fetchEvenements = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('evenements').select('*, lieux(*)')
      .eq('statut', 'publie').order('date_debut', { ascending: true })

    if (filtres.categories.length > 0) query = query.in('categorie', filtres.categories)
    const range = getDateRange(filtres.quand)
    if (range) query = query.gte('date_debut', range.from).lte('date_debut', range.to)

    const { data } = await query
    setEvenements((data as Evenement[]) ?? [])
    setLoading(false)
  }, [filtres])

  useEffect(() => { fetchEvenements() }, [fetchEvenements])

  const handleNavTab = (tab: NavTab) => {
    if (tab === 'profil') { router.push('/profil'); return }
    setNavTab(tab)
    if (tab === 'liste') setSheetMode('full')
    if (tab === 'carte') setSheetMode('half')
  }

  const handleViewOnMap = (id: string) => {
    setSelectedId(id)
    setNavTab('carte')
    setSheetMode('half')
  }

  const showFab = navTab === 'carte' && sheetMode !== 'full'

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: '#e8dece' }}>

      {/* Carte plein écran */}
      <div className="absolute inset-0" style={{ bottom: NAV_H }}>
        {/* Bande invisible en haut — laisse passer le geste "tirer pour rafraîchir" */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, zIndex: 5, pointerEvents: 'auto' }} />

        {/* Bouton Carte fixe — coin bas-droit de la carte */}
        <button
          onClick={() => setFixedMap(!fixedMap)}
          title={fixedMap ? 'Carte fixe (cliquer pour libérer)' : 'Carte libre (cliquer pour fixer)'}
          style={{
            position: 'absolute', bottom: 14, right: 14, zIndex: 10,
            width: 40, height: 40, borderRadius: 10,
            backgroundColor: fixedMap ? 'var(--primary)' : 'rgba(255,255,255,0.92)',
            border: fixedMap ? 'none' : '1px solid #E0D8CE',
            boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: fixedMap ? '#fff' : '#8A8A8A',
            transition: 'all 0.18s',
          }}
        >
          {fixedMap ? (
            /* cadenas fermé */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          ) : (
            /* cadenas ouvert */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
          )}
        </button>

        <MapView
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onOpenEvent={id => router.push(`/evenement/${id}`)}
        />
      </div>

      {/* FAB "+" — haut droite, visible seulement sur carte non-full */}
      <AnimatePresence>
        {showFab && (
          <motion.div key="fab"
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 40 }}
          >
            <AnimatePresence>
              {fabOpen && (
                <motion.div key="fab-bg"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setFabOpen(false)}
                  style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.18)', zIndex: -1 }}
                />
              )}
            </AnimatePresence>

            <div style={{ position: 'relative' }}>
              <AnimatePresence>
                {fabOpen && [
                  { label: 'Photo / Affiche', icon: '📷', path: '/capturer' },
                  { label: 'Décrire en texte', icon: '✍️', path: '/ajouter' },
                ].map((opt, i) => (
                  <motion.button key={opt.path}
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => { setFabOpen(false); router.push(opt.path) }}
                    style={{
                      position: 'absolute', right: 60, top: i === 0 ? 2 : 52,
                      display: 'flex', alignItems: 'center', gap: 8,
                      backgroundColor: '#fff', border: '1px solid #EDE8E0',
                      borderRadius: 14, padding: '10px 16px',
                      fontSize: 13, fontWeight: 600, color: '#2C2C2C',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                      whiteSpace: 'nowrap', cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                  </motion.button>
                ))}
              </AnimatePresence>

              <motion.button
                animate={{ rotate: fabOpen ? 45 : 0 }}
                onClick={() => setFabOpen(o => !o)}
                style={{
                  width: 50, height: 50, borderRadius: '50%',
                  backgroundColor: 'var(--primary)', color: '#fff',
                  fontSize: 28, fontWeight: 300,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 3px 16px rgba(0,0,0,0.28)',
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
        onModeChange={setSheetMode}
        navHeight={NAV_H}
      />

      {/* Bottom Nav — 3 onglets */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        backgroundColor: '#fff', borderTop: '1px solid #EDE8E0',
        display: 'flex', zIndex: 30,
      }}>
        {NAV_TABS.map(tab => {
          const active = navTab === tab.id
          return (
            <button key={tab.id} onClick={() => handleNavTab(tab.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
              borderTop: active ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              transition: 'border-color 0.15s',
              paddingBottom: 4,
              color: active ? 'var(--primary)' : '#8A8A8A',
            }}>
              <tab.Icon />
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
