'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Modales utilisées par le Hub :
 *   - ComingSoonModal   : "Bientôt disponible — On y travaille"
 *   - QuotaReachedModal : "Quota atteint — Contacter l'admin"
 *
 * Pour le pitch d'abonnement, utilise SubscriptionModal (component séparé).
 */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: 'var(--font-body), sans-serif',
      }}
    >
      <div className="pcv-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, backgroundColor: '#fff',
          borderRadius: '24px 24px 0 0', padding: '28px 24px 32px',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function ComingSoonModal({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🚧</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1209', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          {label}
        </h2>
        <p style={{ fontSize: 14, color: '#7A6A5A', margin: '0 0 24px', lineHeight: 1.6 }}>
          Ce module arrive bientôt. Reviens plus tard !
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px',
            backgroundColor: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
          }}
        >
          OK
        </button>
      </div>
    </Modal>
  )
}

export function QuotaReachedModal({
  onClose,
  defaultSubject = 'Demande exceptionnelle de revendication',
  etablissementId,
  etablissementNom,
}: {
  onClose: () => void
  defaultSubject?: string
  /** Si la modale est ouverte depuis une fiche établissement, on transmet
   *  l'id à l'API → l'admin pourra Accepter (= revendication validée). */
  etablissementId?: string
  etablissementNom?: string
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subject = etablissementNom
    ? `Demande exceptionnelle : ${etablissementNom}`
    : defaultSubject

  const send = async () => {
    if (!message.trim()) return
    setSending(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Veuillez vous connecter'); setSending(false); return }
    const res = await fetch('/api/admin-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ subject, message, etablissement_id: etablissementId }),
    })
    setSending(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur lors de l\'envoi')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <Modal onClose={onClose}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1209', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
            Message envoyé
          </h2>
          <p style={{ fontSize: 13, color: '#7A6A5A', margin: '0 0 22px', lineHeight: 1.6 }}>
            Un administrateur a été notifié. Vous recevrez une notification quand votre demande sera traitée.
          </p>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: 14,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--font-body), sans-serif',
            }}
          >
            OK
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>⏳</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1209', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
            Quota atteint ce mois
          </h2>
          <p style={{ fontSize: 13, color: '#7A6A5A', margin: '0 0 4px', lineHeight: 1.5 }}>
            Vous avez utilisé vos revendications mensuelles.
          </p>
          {etablissementNom && (
            <p style={{ fontSize: 12, color: '#3C2C20', margin: '6px 0 8px', lineHeight: 1.4, backgroundColor: '#FBF7F0', padding: '6px 10px', borderRadius: 8, display: 'inline-block' }}>
              Pour <strong>{etablissementNom}</strong>
            </p>
          )}
          <p style={{ fontSize: 12, color: '#9A8A7A', margin: 0, lineHeight: 1.5 }}>
            {etablissementNom
              ? 'Expliquez votre besoin à l\'admin, il pourra valider votre demande.'
              : 'Envoyez un message à l\'admin pour discuter d\'une demande exceptionnelle.'}
          </p>
        </div>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Expliquez votre besoin en quelques lignes…"
          rows={5}
          maxLength={2000}
          style={{
            width: '100%', padding: '12px 14px',
            borderRadius: 12, border: '1.5px solid #E0D8CE',
            fontSize: 14, color: '#2C1810', outline: 'none',
            backgroundColor: '#FBF7F0',
            boxSizing: 'border-box', fontFamily: 'var(--font-body), sans-serif',
            resize: 'none', lineHeight: 1.5,
            marginBottom: 8,
          }}
        />

        {error && (
          <p style={{ fontSize: 12, color: '#E53935', margin: '0 0 10px', textAlign: 'center' }}>{error}</p>
        )}

        <button
          onClick={send}
          disabled={sending || !message.trim()}
          style={{
            width: '100%', padding: '14px',
            backgroundColor: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 14, fontWeight: 700,
            cursor: sending || !message.trim() ? 'default' : 'pointer',
            opacity: sending || !message.trim() ? 0.5 : 1,
            fontFamily: 'var(--font-body), sans-serif',
            marginBottom: 8,
          }}
        >
          {sending ? 'Envoi…' : '📩 Envoyer ma demande'}
        </button>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px',
            background: 'none', border: 'none',
            fontSize: 12, color: '#9A8A7A',
            cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
          }}
        >
          Annuler
        </button>
      </div>
    </Modal>
  )
}

