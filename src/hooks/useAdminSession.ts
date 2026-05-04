import { useAuth } from '@/contexts/AuthContext'

export function useAdminSession(): boolean {
  return useAuth().isAdmin
}
