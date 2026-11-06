'use client'
import { useEffect, useState } from 'react'
import { SWRConfig, unstable_serialize, useSWRConfig, type Middleware } from 'swr'
import { memoireVillageVide } from '@/components/SWRProvider'
import { useTerritoire } from '@/components/TerritoireProvider'
import { useAuth } from '@/contexts/AuthContext'
import { signalerMiseAJour } from '@/lib/miseAJour'

/**
 * LES SECTIONS DU VILLAGE ARRIVENT ENSEMBLE.
 *
 * D'ordinaire la page s'ouvre déjà faite, sur la mémoire de la dernière
 * visite (SWRProvider). Quand il n'y en a pas — premier lancement, données
 * effacées —, on demande la page entière en UN paquet
 * (/api/village/instantane), on le verse dans le cache de chaque bloc, et
 * c'est SEULEMENT ENSUITE qu'on monte les sections : elles s'affichent
 * d'un coup, déjà remplies, puis se rafraîchissent derrière.
 *
 * Pourquoi ne pas les monter en même temps : au premier lancement, l'appli
 * lance ~25 demandes à la fois (trace du 06/11, réseau bridé) ; montés tout
 * de suite, les blocs mettaient le paquet en file derrière les leurs, et la
 * page attendait plus longtemps qu'avant.
 *
 * Jamais plus de MAX_MS : sans paquet, les blocs se débrouillent seuls.
 * Pendant ce temps, « Mise à jour » tourne à côté de « Aujourd'hui » — c'est
 * aussi lui qui tourne quand les blocs se rafraîchissent (middleware).
 */
const MAX_MS = 10_000

const suivi: Middleware = useSWRNext => (key, fetcher, config) => {
  const swr = useSWRNext(key, fetcher, config)
  const cle = typeof key === 'string' ? key : Array.isArray(key) ? JSON.stringify(key) : null
  const enCours = swr.isValidating
  useEffect(() => {
    if (!cle) return
    signalerMiseAJour(cle, enCours)
    return () => signalerMiseAJour(cle, false)
  }, [cle, enCours])
  return swr
}

/** Date LOCALE, même calcul que TodaySection (sa clé /api/hub en dépend). */
function jourLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Une seule fois par session : ensuite le cache SWR est plein. */
let dejaFait = false

export default function ChargementGroupe({ children }: { children: React.ReactNode }) {
  const [premiereFois] = useState(() => !dejaFait && memoireVillageVide)
  const [monte, setMonte] = useState(!premiereFois)
  const { cache, mutate } = useSWRConfig()
  const { territoire, pret: territoirePret } = useTerritoire()
  const { user } = useAuth()
  const slug = territoire?.slug ?? null
  const userId = user?.id ?? null

  useEffect(() => {
    if (monte) return
    dejaFait = true
    signalerMiseAJour('instantane', true)
    const t = setTimeout(() => setMonte(true), MAX_MS)
    return () => { clearTimeout(t); signalerMiseAJour('instantane', false) }
  }, [monte])

  /* Les clés recopient À L'IDENTIQUE celles des blocs (TodaySection,
     CinemaAffiche, BoisAffiche, TheatreAffiche, RadioAffiche,
     AnnoncesAffiche) : une clé qui diverge ne remplit rien. */
  useEffect(() => {
    if (monte || !territoirePret) return
    if (!slug) { setMonte(true); return }
    let annule = false
    fetch(`/api/village/instantane?territoire=${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(p => {
        if (annule || !p?.blocs) return
        const t = `territoire=${encodeURIComponent(slug)}`
        const lecteurs = userId ? ['anon', userId] : ['anon']
        const entrees: [string | [string, string], unknown][] = [
          [`/api/cinema/affiche?${t}`, p.blocs.cinema],
          [`/api/radio?${t}`, p.blocs.radio],
          [`/api/annonces?limit=20&${t}`, p.blocs.annonces],
          ...lecteurs.flatMap((u): [[string, string], unknown][] => [
            [[`/api/champignons?${t}`, u], p.blocs.champignons],
            [[`/api/theatre?${t}`, u], p.blocs.theatre],
          ]),
        ]
        if (p.jour === jourLocal()) entrees.push([`/api/hub?d=${p.jour}&${t}`, p.blocs.hub])
        for (const [cle, donnees] of entrees) {
          if (donnees == null || cache.get(unstable_serialize(cle))?.data !== undefined) continue
          mutate(cle, donnees, { revalidate: false })
        }
      })
      .catch(() => { /* les blocs se débrouillent seuls, comme avant */ })
      .finally(() => { if (!annule) setMonte(true) })
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monte, territoirePret, slug])

  return (
    <SWRConfig value={{ use: [suivi] }}>
      {monte && <div className={premiereFois ? 'lpv-apparition' : undefined}>{children}</div>}
    </SWRConfig>
  )
}
