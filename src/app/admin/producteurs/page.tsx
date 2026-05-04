'use client'
import dynamic from 'next/dynamic'

const ProduceurAdmin = dynamic(() => import('@/components/ProduceurAdmin'), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#C4622D', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  ),
})

export default function AdminProducteursPage() {
  return <ProduceurAdmin />
}
