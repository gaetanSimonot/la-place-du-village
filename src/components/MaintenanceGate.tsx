'use client'
import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { useAuth } from '@/contexts/AuthContext'
import MaintenanceScreen from './MaintenanceScreen'

/**
 * Gate de mode maintenance — affiche MaintenanceScreen pour les visiteurs
 * lambda quand le flag config.maintenance_mode === 'true'.
 *
 * GARDE-FOUS NON NÉGOCIABLES (ordre d'évaluation) :
 *   1. /admin TOUJOURS exempté — sans même regarder isAdmin.
 *      => en cas de bug détection admin, le toggle reste accessible.
 *   2. ?nomaint=<anything> dans l'URL = bypass total et persistant pour la
 *      session (sessionStorage). Filet de secours universel.
 *   3. FAIL OPEN : on n'affiche la maintenance QUE si data.enabled === true
 *      confirmé. Loading / erreur réseau / clé absente / Supabase down → app.
 *   4. isAdmin === true → app.
 *
 * Effet en mode OFF : la SWR ne change pas la couleur d'eau, render direct.
 */
export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isAdmin } = useAuth()
  // useSWR via SWRProvider global → defaultFetcher throw sur !ok, donc data
  // reste undefined sur erreur, ce qui maintient le FAIL OPEN.
  const { data } = useSWR<{ enabled: boolean }>('/api/maintenance', {
    refreshInterval: 60_000,
  })

  // Filet de secours ?nomaint= : lu via window.location pour ne pas forcer la
  // dynamique du layout (useSearchParams casserait le prerender static des
  // pages enfant — cf. memory feedback_nextjs_searchparams_static).
  const [nomaintBypass, setNomaintBypass] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.has('nomaint')) {
        sessionStorage.setItem('nomaint', '1')
        setNomaintBypass(true)
      } else if (sessionStorage.getItem('nomaint') === '1') {
        setNomaintBypass(true)
      }
    } catch {
      // sessionStorage indispo (private mode iOS) → ignore, on retombe sur
      // les autres garde-fous (/admin et FAIL OPEN couvrent déjà 99%).
    }
  }, [])

  // 1. /admin TOUJOURS exempté, même si isAdmin n'est pas (encore) résolu.
  if (pathname?.startsWith('/admin')) return <>{children}</>

  // 2. Échappatoire URL
  if (nomaintBypass) return <>{children}</>

  // 3. FAIL OPEN — défaut : app visible
  if (!data || data.enabled !== true) return <>{children}</>

  // 4. Admin reconnu
  if (isAdmin) return <>{children}</>

  // Maintenance confirmée + visiteur lambda
  return <MaintenanceScreen />
}
