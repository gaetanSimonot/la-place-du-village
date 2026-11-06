'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { SWRConfig, type Middleware } from 'swr'
import { memoireVillageVide } from '@/components/SWRProvider'

/**
 * LES SECTIONS DU VILLAGE ARRIVENT ENSEMBLE.
 *
 * D'ordinaire la page s'ouvre déjà faite, sur la mémoire de la dernière
 * visite (SWRProvider). Quand il n'y en a pas — premier lancement, données
 * effacées —, chaque bloc apparaissait à son tour et poussait les autres.
 * On les tient donc invisibles jusqu'à ce que toutes leurs requêtes aient
 * répondu, puis on les montre d'un coup. Jamais plus de MAX_MS : un bloc
 * lent n'a pas le droit de retenir la page entière.
 *
 * Le suivi passe par un middleware SWR posé sur les seules sections : chaque
 * useSWR du dessous signale « j'ai ma réponse », sans qu'aucun bloc ait à le
 * savoir.
 */
const MIN_MS = 300   // laisse aux clés tardives (zone, territoire) le temps de s'annoncer
const MAX_MS = 1500

type Registre = { maj: (cle: string, pret: boolean) => void; retirer: (cle: string) => void }
const RegistreCtx = createContext<Registre | null>(null)

const suivi: Middleware = useSWRNext => (key, fetcher, config) => {
  const swr = useSWRNext(key, fetcher, config)
  const registre = useContext(RegistreCtx)
  const cle = typeof key === 'string' ? key : Array.isArray(key) ? JSON.stringify(key) : null
  const pret = swr.data !== undefined || swr.error !== undefined
  useEffect(() => { if (registre && cle) registre.maj(cle, pret) }, [registre, cle, pret])
  useEffect(() => () => { if (registre && cle) registre.retirer(cle) }, [registre, cle])
  return swr
}

/** On n'attend qu'une fois par session : ensuite le cache SWR est plein. */
let dejaAttendu = false

export default function ChargementGroupe({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(() => dejaAttendu || !memoireVillageVide)
  const etats = useRef(new Map<string, boolean>())
  const [registre] = useState<Registre>(() => ({
    maj: (cle, pret) => { etats.current.set(cle, pret) },
    retirer: cle => { etats.current.delete(cle) },
  }))

  useEffect(() => {
    if (visible) return
    dejaAttendu = true
    const debut = Date.now()
    const t = setInterval(() => {
      const ecoule = Date.now() - debut
      const tousPrets = etats.current.size > 0 && Array.from(etats.current.values()).every(Boolean)
      if (ecoule >= MAX_MS || (ecoule >= MIN_MS && tousPrets)) { clearInterval(t); setVisible(true) }
    }, 100)
    return () => clearInterval(t)
  }, [visible])

  return (
    <RegistreCtx.Provider value={registre}>
      <SWRConfig value={{ use: [suivi] }}>
        <div style={{ opacity: visible ? 1 : 0, transition: 'opacity .25s ease' }}>
          {children}
        </div>
      </SWRConfig>
    </RegistreCtx.Provider>
  )
}
