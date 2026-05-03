import { useState, useEffect } from 'react'

const SESSION_KEY      = 'pdv-admin-session'
const SESSION_DURATION = 30 * 60 * 1000

export function useAdminSession(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return
      const { ts } = JSON.parse(raw)
      setIsAdmin(Date.now() - ts < SESSION_DURATION)
    } catch {}
  }, [])
  return isAdmin
}
