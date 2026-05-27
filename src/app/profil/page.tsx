'use client'
import ProfilHybridView from '@/components/profil/ProfilHybridView'
import BottomNavBar from '@/components/BottomNavBar'

/**
 * Page /profil — refonte V3 "profil hybride".
 *
 * Le composant ProfilView legacy est conservé volontairement (utilisé encore
 * par d'autres entrées possibles ; cleanup dans une PR dédiée une fois la
 * refonte stabilisée).
 *
 * AdminAccess est temporairement absent pendant la refonte — il sera remis
 * dans /reglages > groupe Compte au commit 4.
 */
export default function ProfilPage() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--creme)' }}>
      <ProfilHybridView />
      <BottomNavBar />
    </div>
  )
}
