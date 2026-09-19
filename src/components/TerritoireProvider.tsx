'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
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

  /*
   * UN CHOIX FAIT A LA MAIN NE DOIT PLUS JAMAIS ETRE RELU PAR-DESSUS.
   *
   * L'effet ci-dessous se rejoue a chaque fois qu'`isAdmin` change — et sur
   * telephone ca arrive tout seul : l'app reprise en arriere-plan rafraichit
   * son jeton, `isAdmin` retombe a false une fraction de seconde puis
   * remonte. L'effet relisait alors la valeur gardee et ECRASAIT le choix
   * qu'on venait de faire : on tape « Cevennes », l'ecran repasse sur Pau
   * sans rien dire. Invisible sur PC, ou la session ne bouge pas.
   */
  const choixExplicite = useRef(false)

  // Le choix garde n'est relu QU'AUX ADMINS. Si l'un d'eux perd ses droits,
  // il retombe seul sur le territoire par defaut sans rien avoir a nettoyer
  // (c'est `slugEffectif` plus bas qui s'en charge, pas cet effet).
  useEffect(() => {
    if (!isAdmin || choixExplicite.current) return

    /*
     * `?territoire=<slug>` force la vue, une fois, et devient le choix garde.
     * C'est la porte de sortie quand le choix enregistre est coince sur un
     * appareil qu'on n'a pas sous la main : un lien suffit a s'en defaire.
     * Reserve a l'admin comme le reste — le parametre ne fait rien aux autres.
     */
    let voulu: string | null = null
    try { voulu = new URLSearchParams(window.location.search).get('territoire') } catch { voulu = null }

    if (voulu) {
      choixExplicite.current = true
      setSlug(voulu)
      try { localStorage.setItem(CLE, voulu) } catch { /* choix non garde */ }
      return
    }

    try {
      const garde = localStorage.getItem(CLE)
      if (garde) setSlug(garde)
    } catch { /* pas de choix garde */ }
  }, [isAdmin])

  /*
   * Un slug garde qui ne correspond a aucun territoire est efface. Sans ca il
   * reste la indefiniment, a faire retomber l'ecran sur le defaut a chaque
   * ouverture sans qu'on comprenne pourquoi.
   */
  useEffect(() => {
    if (!pret || !slug) return
    if (territoires.some(t => t.slug === slug)) return
    setSlug(null)
    try { localStorage.removeItem(CLE) } catch { /* rien a nettoyer */ }
  }, [pret, slug, territoires])

  /*
   * LE DROIT DE BASCULER SE VERIFIE A L'AFFICHAGE, PAS A L'ENREGISTREMENT.
   *
   * La garantie est la meme — qui n'est pas admin voit toujours le territoire
   * par defaut, quoi qu'il y ait en memoire. Mais la refuser au moment du clic
   * creait une panne silencieuse sur telephone : `isAdmin` retombe a false une
   * fraction de seconde quand l'app reprend et rafraichit son jeton, et un
   * appui tombe pile dans cette fenetre ne faisait RIEN. Le bouton repondait
   * une fois sur deux, sans message, sans trace.
   */
  const slugEffectif = isAdmin ? slug : null

  const territoire =
    (slugEffectif ? territoires.find(t => t.slug === slugEffectif) : null)
    ?? territoires.find(t => t.par_defaut)
    ?? territoires[0]
    ?? null

  const choisirTerritoire = useCallback((s: string) => {
    // Le marquer AVANT de poser l'etat : a partir d'ici, plus aucune
    // relecture n'a le droit de revenir dessus.
    choixExplicite.current = true
    setSlug(s)
    try { localStorage.setItem(CLE, s) } catch { /* choix non garde */ }
  }, [])

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
