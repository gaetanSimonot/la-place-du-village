'use client'
import { usePushNotifications } from '@/hooks/usePushNotifications'

export default function PushToggle() {
  const { state, busy, enable, disable } = usePushNotifications()

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: '14px 16px',
    border: '1px solid #EFE7D6', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  }
  const title = <span style={{ fontWeight: 700, fontSize: 14.5, color: '#2E211A' }}>🔔 Notifications push</span>
  const sub = (txt: string) => <span style={{ display: 'block', fontSize: 12.5, color: '#8A7D70', marginTop: 2 }}>{txt}</span>

  if (state === 'loading') return null

  if (state === 'unsupported') {
    return <div style={card}><span>{title}{sub('Non supporté par ce navigateur.')}</span></div>
  }
  if (state === 'ios-needs-install') {
    return (
      <div style={card}>
        <span>{title}{sub("Sur iPhone : ajoute d'abord l'app à l'écran d'accueil, puis reviens ici.")}</span>
        <a href="/app" style={{ flexShrink: 0, textDecoration: 'none', background: '#3E7A52', color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 700 }}>Installer</a>
      </div>
    )
  }
  if (state === 'denied') {
    return <div style={card}><span>{title}{sub('Bloquées. Réautorise-les dans les réglages du navigateur pour ce site.')}</span></div>
  }

  const on = state === 'on'
  return (
    <div style={card}>
      <span>{title}{sub(on ? 'Activées sur cet appareil.' : 'Fais sonner ton téléphone pour les messages et notifs.')}</span>
      <button
        onClick={on ? disable : enable}
        disabled={busy}
        style={{
          flexShrink: 0, border: 'none', cursor: busy ? 'default' : 'pointer',
          borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 700,
          background: on ? '#F2EAD9' : '#C14A2B', color: on ? '#6E6256' : '#fff',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? '…' : on ? 'Désactiver' : 'Activer'}
      </button>
    </div>
  )
}
