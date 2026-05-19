'use client'
import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Si true, le bouton confirm est rouge (action destructive) */
  destructive?: boolean
}

type Resolver = (ok: boolean) => void

interface ConfirmCtx {
  /** Retourne true si l'utilisateur a confirmé, false sinon */
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const Ctx = createContext<ConfirmCtx>({
  confirm: async () => true,
})

export function useConfirm() { return useContext(Ctx) }

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve
      setOpts(options)
    })
  }, [])

  const close = (ok: boolean) => {
    const r = resolverRef.current
    resolverRef.current = null
    setOpts(null)
    r?.(ok)
  }

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <Ctx.Provider value={value}>
      {children}
      {opts && typeof document !== 'undefined' && createPortal(
        <ConfirmDialog
          opts={opts}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />,
        document.body,
      )}
    </Ctx.Provider>
  )
}

function ConfirmDialog({
  opts, onConfirm, onCancel,
}: {
  opts: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdv-confirm-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(26,18,9,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: '#FDFAF5',
          borderRadius: 20,
          padding: '20px 20px 16px',
          boxShadow: '0 -8px 30px rgba(26,18,9,0.35)',
          fontFamily: 'Inter, sans-serif',
          animation: 'pdv-confirm-up 180ms cubic-bezier(0.2, 0.9, 0.3, 1.05)',
        }}
      >
        <h2
          id="pdv-confirm-title"
          style={{
            margin: 0,
            fontFamily: 'var(--font-dm-serif), Georgia, serif',
            fontSize: 20, color: '#1A1209',
            letterSpacing: '-0.01em', lineHeight: 1.2,
          }}
        >
          {opts.title}
        </h2>
        {opts.message && (
          <p style={{
            margin: '10px 0 0',
            fontSize: 13, color: '#7A6A5A', lineHeight: 1.5,
          }}>
            {opts.message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, height: 46, borderRadius: 12,
              border: '1px solid #E8E0D4', background: '#fff',
              fontSize: 13, fontWeight: 700, color: '#1A1209',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {opts.cancelLabel ?? 'Annuler'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            style={{
              flex: 1, height: 46, borderRadius: 12,
              border: 'none',
              background: opts.destructive ? '#C84B2F' : '#2D5A3D',
              color: '#fff',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: opts.destructive
                ? '0 3px 10px rgba(200,75,47,0.32)'
                : '0 3px 10px rgba(45,90,61,0.32)',
            }}
          >
            {opts.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes pdv-confirm-up {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
