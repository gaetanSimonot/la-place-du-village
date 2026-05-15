'use client'
import ProfilView from '@/components/ProfilView'
import AdminAccess from '@/components/AdminAccess'

/**
 * Page directe /profil — réutilise ProfilView pour avoir une seule source de vérité
 * (le même composant que celui affiché dans l'onglet "Profil" de la nav bottom).
 */
export default function ProfilPage() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--creme)' }}>
      <ProfilView />
      <AdminAccess />
    </div>
  )
}
