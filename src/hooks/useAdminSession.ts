import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useAdminSession(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return
      const { data } = await supabase
        .from('admin_emails')
        .select('email')
        .eq('email', user.email)
        .maybeSingle()
      setIsAdmin(!!data)
    })
  }, [])

  return isAdmin
}
