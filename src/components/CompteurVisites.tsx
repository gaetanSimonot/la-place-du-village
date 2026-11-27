'use client'
import { useEffect } from 'react'
import { noterVisite } from '@/lib/origineVisite'

/**
 * Compte chaque visite (une par session), où qu'on arrive : la demande de
 * notifications attend la 3e visite de qui est venu par Google. Ne rend rien.
 */
export default function CompteurVisites() {
  useEffect(() => { noterVisite() }, [])
  return null
}
