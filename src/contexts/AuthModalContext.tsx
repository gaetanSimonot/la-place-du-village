'use client'
import { createContext, useContext, useState } from 'react'

interface AuthModalCtx {
  open: boolean
  returnTo: string | null
  openAuthModal: (returnTo?: string) => void
  closeAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalCtx>({
  open: false,
  returnTo: null,
  openAuthModal: () => {},
  closeAuthModal: () => {},
})

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen]         = useState(false)
  const [returnTo, setReturnTo] = useState<string | null>(null)
  return (
    <AuthModalContext.Provider value={{
      open, returnTo,
      openAuthModal: (url?: string) => { setReturnTo(url ?? null); setOpen(true) },
      closeAuthModal: () => setOpen(false),
    }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export const useAuthModal = () => useContext(AuthModalContext)
