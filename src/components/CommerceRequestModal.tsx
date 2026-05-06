'use client'
import { useState } from 'react'

const TYPES = [
  'Restaurant / Café', 'Boulangerie / Pâtisserie', 'Épicerie / Alimentation',
  'Artisan / Créateur', 'Boutique / Commerce', 'Service', 'Autre',
]

export default function CommerceRequestModal({ onClose }: { onClose: () => void }) {
  const [nom, setNom] = useState('')
  const [type, setType] = useState('')
  const [commune, setCommune] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setLoading(true)
    const res = await fetch('/api/commerce-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: nom.trim(), type, commune: commune.trim(), contact: contact.trim(), message: message.trim() }),
    })
    setLoading(false)
    if (res.ok) setDone(true)
  }

  const INPUT: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E0D8CE', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#2C1810', backgroundColor: '#FDFAF6' }
  const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B5E4E', textTransform: 'uppercase', letterSpacing: '0.04em' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.42)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 48px', fontFamily: 'Inter, sans-serif', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <p style={{ fontWeight: 800, fontSize: 18, color: '#2C1810', margin: '0 0 8px' }}>Merci !</p>
            <p style={{ fontSize: 14, color: '#6B5E4E', lineHeight: 1.6, margin: '0 0 24px', fontFamily: 'Lora, serif' }}>Votre demande a bien été envoyée. Nous vous contacterons prochainement pour finaliser votre fiche.</p>
            <button onClick={onClose} style={{ padding: '13px 28px', borderRadius: 999, backgroundColor: '#2D5A3D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Fermer</button>
          </div>
        ) : (
          <>
            <p style={{ fontWeight: 800, fontSize: 18, color: '#2C1810', margin: '0 0 4px' }}>Référencer votre commerce</p>
            <p style={{ fontSize: 13, color: '#8A8A8A', margin: '0 0 20px', lineHeight: 1.5 }}>Partagez vos coordonnées — nous publierons votre fiche sur la carte et vous contacterons.</p>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Nom du commerce *</label>
                <input value={nom} onChange={e => setNom(e.target.value)} required placeholder="Ex: Boulangerie du Village" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Type d&apos;activité</label>
                <select value={type} onChange={e => setType(e.target.value)} style={{ ...INPUT, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A8A8A' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                  <option value="">-- Choisir --</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Commune</label>
                <input value={commune} onChange={e => setCommune(e.target.value)} placeholder="Ex: Ganges" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Contact (tél, WhatsApp…)</label>
                <input value={contact} onChange={e => setContact(e.target.value)} placeholder="06 12 34 56 78" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Message (optionnel)</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Décrivez votre activité, vos horaires, vos produits…" rows={3}
                  style={{ ...INPUT, resize: 'vertical' as const }} />
              </div>
              <button type="submit" disabled={loading || !nom.trim()}
                style={{ padding: '14px', borderRadius: 16, border: 'none', backgroundColor: nom.trim() && !loading ? '#2D5A3D' : '#D0C8C0', color: '#fff', fontWeight: 700, fontSize: 15, cursor: nom.trim() && !loading ? 'pointer' : 'default', fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }}>
                {loading ? 'Envoi en cours…' : 'Envoyer ma demande →'}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  )
}
