'use client'
import { createContext, useContext, useState } from 'react'
import { getCurrentPathAsReturn, sanitizeNext } from '@/lib/authRedirect'

interface AuthModalCtx {
  open: boolean
  returnTo: string
  openAuthModal: (returnTo?: string) => void
  closeAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalCtx>({
  open: false,
  returnTo: '/',
  openAuthModal: () => {},
  closeAuthModal: () => {},
})

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [returnTo, setReturnTo] = useState<string>('/')
  return (
    <AuthModalContext.Provider value={{
      open,
      returnTo,
      // Si pas d'arg : capture la page courante. Sinon : sanitize l'arg.
      // Plus aucun call site ne peut "oublier" le returnTo.
      openAuthModal: (url?: string) => {
        setReturnTo(url ? sanitizeNext(url) : getCurrentPathAsReturn())
        setOpen(true)
      },
      closeAuthModal: () => setOpen(false),
    }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export const useAuthModal = () => useContext(AuthModalContext)
