'use client'
import dynamic from 'next/dynamic'

const SupportList = dynamic(() => import('./client'), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  ),
})

export default function SupportListPage() {
  return <SupportList />
}
