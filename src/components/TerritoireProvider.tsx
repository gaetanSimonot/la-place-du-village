'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdminSession } from '@/hooks/useAdminSession'

/**
 * LE TERRITOIRE COURANT, COTE ECRAN.
 *
 * L'app couvre plusieurs territoires ; celui-ci dit lequel on regarde. Il
 * voyage ensuite dans les appels (`?territoire=<slug>`) pour que l'agenda, la
 * carte et le cadrage racontent tous la meme ville.
 *
 * RESERVE A L'ADMIN, ET C'EST LA GARANTIE DU CHANTIER. Un visiteur est
 * toujours dans le territoire par defaut : il ne peut pas en changer, et rien
 * ne change pour lui. Un scoping oublie quelque part ne se voit donc que dans
 * le mode test de l'admin — le cout d'une erreur est nul tant que le
 * selecteur n'est pas ouvert a tous.
 *
 * Le choix vit en localStorage et non en base : c'est une preference de
 * lecture, personnelle, pas un reglage qui s'impose aux autres. A l'inverse du
 * style de carte, qui lui est global.
 */

export interface TerritoireVue {
  id: string
  slug: string
  nom: string
  par_defaut: boolean
}

interface Ctx {
  /** Le territoire regarde. `null` tant que la liste n'est pas chargee. */
  territoire: TerritoireVue | null
  /** Tous les territoires actifs — pour le selecteur admin. */
  territoires: TerritoireVue[]
  /** Change de territoire. Sans effet pour qui n'est pas admin. */
  choisirTerritoire: (slug: string) => void
  /** Vrai une fois la liste lue : evite de lancer des requetes a l'aveugle. */
  pret: boolean
  /** Vrai si plusieurs territoires existent ET qu'on a le droit de basculer. */
  peutBasculer: boolean
}

const CLE = 'pdv-territoire'

const TerritoireContext = createContext<Ctx>({
  territoire: null, territoires: [], choisirTerritoire: () => {}, pret: false, peutBasculer: false,
})

export function useTerritoire() { return useContext(TerritoireContext) }

export function TerritoireProvider({ children }: { children: React.ReactNode }) {
  const isAdmin = useAdminSession()
  const [territoires, setTerritoires] = useState<TerritoireVue[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [pret, setPret] = useState(false)

  // Lecture directe Supabase, pas fetch('/api/…') : le service worker peut
  // intercepter les routes API. Les territoires sont publics en lecture.
  useEffect(() => {
    let vivant = true
    supabase.from('territoires')
      .select('id, slug, nom, par_defaut')
      .eq('actif', true)
      .then(({ data }) => {
        if (!vivant) return
        setTerritoires((data ?? []) as TerritoireVue[])
        setPret(true)
      })
    return () => { vivant = false }
  }, [])

  // Le choix garde n'est relu QU'AUX ADMINS. Si l'un d'eux perd ses droits,
  // il retombe seul sur le territoire par defaut sans rien avoir a nettoyer.
  useEffect(() => {
    if (!isAdmin) { setSlug(null); return }
    try {
      const garde = localStorage.getItem(CLE)
      if (garde) setSlug(garde)
    } catch { /* pas de choix garde */ }
  }, [isAdmin])

  const territoire =
    (slug ? territoires.find(t => t.slug === slug) : null)
    ?? territoires.find(t => t.par_defaut)
    ?? territoires[0]
    ?? null

  const choisirTerritoire = useCallback((s: string) => {
    if (!isAdmin) return
    setSlug(s)
    try { localStorage.setItem(CLE, s) } catch { /* choix non garde */ }
  }, [isAdmin])

  return (
    <TerritoireContext.Provider value={{
      territoire,
      territoires,
      choisirTerritoire,
      pret,
      peutBasculer: isAdmin && territoires.length > 1,
    }}>
      {children}
    </TerritoireContext.Provider>
  )
}
