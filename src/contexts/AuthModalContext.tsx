'use client'
import { createContext, useContext, useState } from 'react'

interface AuthModalCtx {
  open: boolean
  openAuthModal: () => void
  closeAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalCtx>({
  open: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
})

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <AuthModalContext.Provider value={{ open, openAuthModal: () => setOpen(true), closeAuthModal: () => setOpen(false) }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export const useAuthModal = () => useContext(AuthModalContext)
