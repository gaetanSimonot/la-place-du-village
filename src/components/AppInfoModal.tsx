'use client'

export default function AppInfoModal({ onClose }: { onClose: () => void }) {
  const sections = [
    { emoji: '📅', title: "L'Agenda local", text: "Tous les événements de votre région : marchés, concerts, ateliers, fêtes de village… Publiez un événement en quelques secondes et touchez toute la communauté." },
    { emoji: '🛒', title: "L'Annuaire des producteurs", text: "Découvrez producteurs et artisans locaux sur la carte. Suivez vos favoris et recevez une notification dès qu'un produit est disponible." },
    { emoji: '🌱', title: "Suivre un producteur", text: "En suivant un producteur vous êtes alerté de ses nouveaux produits. Acheter local n&apos;a jamais été aussi simple." },
    { emoji: '📍', title: "Votre zone", text: "Paramétrez votre rayon de déplacement pour ne voir que ce qui est proche de chez vous." },
    { emoji: '🔔', title: "Notifications", text: "Recevez des alertes quand un producteur que vous suivez a un nouveau produit ou met à jour sa boutique." },
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.42)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '28px 22px 52px', fontFamily: 'Inter, sans-serif', maxHeight: '88dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 24px' }} />

        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🌿</div>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: '#1C1917', margin: '0 0 8px', letterSpacing: '-0.02em' }}>La Place du Village</h2>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#EC407A', backgroundColor: '#FEF0F5', borderRadius: 999, padding: '3px 12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Version Bêta</span>
          <p style={{ fontSize: 13, color: '#6B5E4E', margin: '12px 0 0', lineHeight: 1.6, fontFamily: 'Lora, serif' }}>
            Votre app locale pour suivre la vie de votre village et soutenir les producteurs du coin.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 22 }}>
          {sections.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', backgroundColor: '#F8F4EE', borderRadius: 14 }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>{s.emoji}</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1917', margin: '0 0 4px' }}>{s.title}</p>
                <p style={{ fontSize: 12, color: '#6B5E4E', lineHeight: 1.6, margin: 0, fontFamily: 'Lora, serif' }}>{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #F0EAE0', paddingTop: 18, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#AAA', margin: '0 0 18px', lineHeight: 1.6 }}>
            L&apos;app est en développement actif — vos retours sont précieux 🙏
          </p>
          <button onClick={onClose} style={{ width: '100%', padding: '14px', borderRadius: 999, backgroundColor: '#2D5A3D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            C&apos;est compris !
          </button>
        </div>
      </div>
    </>
  )
}
