'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

interface Props {
  evenementId: string
  evenementTitre: string
}

type State = 'idle' | 'open' | 'sending' | 'done'

export default function FeedbackButton({ evenementId, evenementTitre }: Props) {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')

  const open  = () => setState('open')
  const close = () => { setState('idle'); setMessage(''); setContact('') }

  const submit = async () => {
    if (!message.trim()) return
    setState('sending')
    await supabase.from('feedbacks').insert({
      evenement_id:    evenementId,
      evenement_titre: evenementTitre,
      message:         message.trim(),
      contact:         contact.trim() || null,
    })
    setState('done')
  }

  return (
    <>
      {/* Bouton discret */}
      <button
        onClick={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '4px auto 0',
          padding: '10px 20px', borderRadius: 999,
          border: '1.5px dashed #D1CAC0',
          backgroundColor: 'transparent',
          color: '#9A8E82', fontSize: 13, fontWeight: 600,
          fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
        </svg>
        Une info en plus ?
      </button>

      {/* Overlay + modal */}
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
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {/* Poignée */}
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />

              {state === 'done' ? (
                <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                  <p style={{ fontSize: 36, marginBottom: 10 }}>🙏</p>
                  <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', marginBottom: 6 }}>
                    Merci !
                  </h3>
                  <p style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.5 }}>
                    Ta suggestion a bien été envoyée.<br/>On la regarde dès que possible.
                  </p>
                  <button onClick={close} style={{
                    marginTop: 20, padding: '12px 32px', borderRadius: 14, border: 'none',
                    backgroundColor: 'var(--primary)', color: '#fff',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                  }}>Fermer</button>
                </div>
              ) : (
                <>
                  <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 17, color: '#2C1810', marginBottom: 4 }}>
                    Proposer une correction
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
                      fontFamily: 'Inter, sans-serif', color: '#2C2C2C',
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
                      fontFamily: 'Inter, sans-serif', color: '#2C2C2C',
                      outline: 'none', boxSizing: 'border-box',
                      backgroundColor: state === 'sending' ? '#F5F1EC' : '#fff',
                    }}
                  />

                  <button
                    onClick={submit}
                    disabled={!message.trim() || state === 'sending'}
                    style={{
                      width: '100%', marginTop: 14, padding: '14px', borderRadius: 14, border: 'none',
                      backgroundColor: message.trim() ? 'var(--primary)' : '#E0D8CE',
                      color: message.trim() ? '#fff' : '#9A8E82',
                      fontWeight: 700, fontSize: 15, cursor: message.trim() ? 'pointer' : 'default',
                      fontFamily: 'Syne, sans-serif', transition: 'all 0.15s',
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
