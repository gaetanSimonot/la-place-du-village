'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

const SESSION_KEY      = 'pdv-admin-session'
const SESSION_DURATION = 30 * 60 * 1000

function isSessionValid(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const { ts } = JSON.parse(raw)
    return Date.now() - ts < SESSION_DURATION
  } catch { return false }
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() }))
}

export default function AdminAccess() {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [digits, setDigits] = useState('')

  // Session valide → accès direct
  useEffect(() => {
    if (isSessionValid()) router.push('/admin')
  }, [router])

  const close = () => { setOpen(false); setDigits('') }

  const press = (d: string) => {
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    if (next.length === 4) {
      saveSession()
      close()
      router.push('/admin')
    }
  }

  const del = () => setDigits(d => d.slice(0, -1))

  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'block', margin: '32px auto 0',
          padding: '6px 16px', borderRadius: 999,
          border: '1px solid #E0D8CE', backgroundColor: 'transparent',
          color: '#C8BFB5', fontSize: 11,
          fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        }}
      >
        ⚙️ Admin
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={close}
              style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)' }}
            />
            <motion.div key="modal"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
                padding: '20px 24px 40px', fontFamily: 'Inter, sans-serif',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', textAlign: 'center', marginBottom: 6 }}>
                Accès admin
              </h3>
              <p style={{ fontSize: 12, color: '#8A8A8A', textAlign: 'center', marginBottom: 24 }}>
                Code à 4 chiffres
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width: 16, height: 16, borderRadius: '50%',
                    backgroundColor: i < digits.length ? '#C4622D' : '#E0D8CE',
                    transition: 'background-color 0.15s',
                  }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 280, margin: '0 auto' }}>
                {PAD.map((key, i) => (
                  <button key={i}
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
                  >{key}</button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
