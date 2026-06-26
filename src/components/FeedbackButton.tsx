'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

interface Props {
  evenementId: string
  evenementTitre: string
  open?: boolean
  onClose?: () => void
}

type State = 'idle' | 'open' | 'sending' | 'done'

export default function FeedbackButton({ evenementId, evenementTitre, open: externalOpen, onClose }: Props) {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (externalOpen) setState('open')
  }, [externalOpen])

  const close = () => { setState('idle'); setMessage(''); setContact(''); setError(null); onClose?.() }

  const submit = async () => {
    if (!message.trim()) return
    setError(null)
    setState('sending')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Connecte-toi pour proposer une correction.')
      }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          evenement_id:    evenementId,
          evenement_titre: evenementTitre,
          message:         message.trim(),
          contact:         contact.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'envoi')
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi')
      setState('open')
    }
  }

  return (
    <>
      {/* Modal uniquement — déclenchée de l'extérieur */}
      <AnimatePresence>
        {(state === 'open' || state === 'sending' || state === 'done') && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={state !== 'sending' ? close : undefined}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                backgroundColor: 'rgba(0,0,0,0.4)',
              }}
            />
            <motion.div
              key="modal"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                backgroundColor: '#fff',
                borderRadius: '20px 20px 0 0',
                padding: '20px 20px 40px',
                fontFamily: 'var(--font-body), sans-serif',
              }}
            >
              {/* Poignée */}
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />

              {state === 'done' ? (
                <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                  <p style={{ fontSize: 36, marginBottom: 10 }}>🙏</p>
                  <h3 style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', marginBottom: 6 }}>
                    Merci !
                  </h3>
                  <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.5 }}>
                    Ta suggestion a bien été envoyée.<br/>On la regarde dès que possible.
                  </p>
                  <button onClick={close} style={{
                    marginTop: 20, padding: '12px 32px', borderRadius: 14, border: 'none',
                    backgroundColor: 'var(--primary)', color: '#fff',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
                  }}>Fermer</button>
                </div>
              ) : (
                <>
                  <h3 style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 17, color: '#2C1810', marginBottom: 4 }}>
                    Signaler un problème
                  </h3>
                  <p style={{ fontSize: 12, color: '#9A8E82', marginBottom: 16 }}>
                    {evenementTitre}
                  </p>

                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Ex : l'heure est incorrecte, l'adresse a changé, il manque le prix…"
                    rows={4}
                    disabled={state === 'sending'}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      border: '1.5px solid #E0D8CE', fontSize: 14, lineHeight: 1.5,
                      fontFamily: 'var(--font-body), sans-serif', color: '#2C2C2C',
                      resize: 'none', outline: 'none', boxSizing: 'border-box',
                      backgroundColor: state === 'sending' ? '#F5F1EC' : '#fff',
                    }}
                  />

                  <input
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder="Ton contact (optionnel) — email ou téléphone"
                    disabled={state === 'sending'}
                    style={{
                      width: '100%', marginTop: 10, padding: '12px 14px', borderRadius: 12,
                      border: '1.5px solid #E0D8CE', fontSize: 14,
                      fontFamily: 'var(--font-body), sans-serif', color: '#2C2C2C',
                      outline: 'none', boxSizing: 'border-box',
                      backgroundColor: state === 'sending' ? '#F5F1EC' : '#fff',
                    }}
                  />

                  {error && (
                    <p style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      backgroundColor: '#FDECEA', color: '#C02C20',
                      fontSize: 12, lineHeight: 1.4,
                    }}>{error}</p>
                  )}

                  <button
                    onClick={submit}
                    disabled={!message.trim() || state === 'sending'}
                    style={{
                      width: '100%', marginTop: 14, padding: '14px', borderRadius: 14, border: 'none',
                      backgroundColor: message.trim() ? 'var(--primary)' : '#E0D8CE',
                      color: message.trim() ? '#fff' : '#9A8E82',
                      fontWeight: 700, fontSize: 15, cursor: message.trim() ? 'pointer' : 'default',
                      fontFamily: 'var(--font-body), sans-serif', transition: 'all 0.15s',
                    }}
                  >
                    {state === 'sending' ? 'Envoi…' : 'Envoyer'}
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
