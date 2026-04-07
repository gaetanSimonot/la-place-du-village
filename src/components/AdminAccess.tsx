'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

// ← change le code ici
const ADMIN_PIN = '2606'
const MAX_ATTEMPTS = 3

export default function AdminAccess() {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [digits, setDigits]     = useState('')
  const [attempts, setAttempts] = useState(0)
  const [shake, setShake]       = useState(false)
  const [hint, setHint]         = useState('')

  const close = () => { setOpen(false); setDigits(''); setHint('') }

  const press = (d: string) => {
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    if (next.length === 4) validate(next)
  }

  const del = () => setDigits(d => d.slice(0, -1))

  const validate = (code: string) => {
    if (code === ADMIN_PIN) {
      close()
      router.push('/admin')
      return
    }
    const newAttempts = attempts + 1
    setAttempts(newAttempts)
    setShake(true)
    setTimeout(() => setShake(false), 500)

    if (newAttempts >= MAX_ATTEMPTS) {
      // 3 échecs → accès quand même
      setHint('Bon OK… 🙃')
      setTimeout(() => { close(); router.push('/admin') }, 800)
    } else {
      setHint(`Code incorrect — ${MAX_ATTEMPTS - newAttempts} essai${MAX_ATTEMPTS - newAttempts > 1 ? 's' : ''} restant`)
      setTimeout(() => setDigits(''), 400)
    }
  }

  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <>
      {/* Bouton discret */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'block', margin: '32px auto 0',
          padding: '6px 16px', borderRadius: 999,
          border: '1px solid #E0D8CE',
          backgroundColor: 'transparent',
          color: '#C8BFB5', fontSize: 11,
          fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        }}
      >
        ⚙️ Admin
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={close}
              style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)' }}
            />
            <motion.div
              key="modal"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
                padding: '20px 24px 40px',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />

              <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', textAlign: 'center', marginBottom: 6 }}>
                Accès admin
              </h3>

              <p style={{ fontSize: 12, color: '#8A8A8A', textAlign: 'center', marginBottom: 24, minHeight: 18 }}>
                {hint || 'Code à 4 chiffres'}
              </p>

              {/* Points */}
              <motion.div
                animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}
              >
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width: 16, height: 16, borderRadius: '50%',
                    backgroundColor: i < digits.length ? 'var(--primary)' : '#E0D8CE',
                    transition: 'background-color 0.15s',
                  }} />
                ))}
              </motion.div>

              {/* Pavé numérique */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 280, margin: '0 auto' }}>
                {PAD.map((key, i) => (
                  <button
                    key={i}
                    onClick={() => key === '⌫' ? del() : key === '' ? undefined : press(key)}
                    disabled={key === ''}
                    style={{
                      height: 64, borderRadius: 14, border: 'none',
                      backgroundColor: key === '⌫' ? '#F5F1EC' : key === '' ? 'transparent' : '#FAF7F2',
                      color: key === '⌫' ? '#8A8A8A' : '#2C2C2C',
                      fontSize: key === '⌫' ? 20 : 22, fontWeight: 600,
                      cursor: key === '' ? 'default' : 'pointer',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
