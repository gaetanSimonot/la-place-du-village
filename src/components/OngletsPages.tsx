'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CATEGORIES } from '@/lib/categories'
import type { Onglet } from '@/lib/agendaPublic'

/**
 * Les pastilles de type des pages d'entrée (« Tout », « Ateliers 11 »…).
 * Chacune est une vraie page — un vrai lien pour Google. Elle s'allume DÈS
 * qu'on la touche, sans attendre la page suivante : sous le doigt, il doit
 * se passer quelque chose tout de suite.
 */
/**
 * L'écran d'attente entre deux pages d'entrée, affiché PAR LE TÉLÉPHONE dès
 * qu'on touche un lien vers une autre (pastille, « Autour », chemin).
 *
 * Pas de loading.tsx : avec lui, le serveur envoie l'attente avant d'avoir
 * décidé si la page existe — le code 200 part, et une page introuvable (Pau,
 * adresse inconnue) n'est plus un vrai 404 pour Google.
 */
const VERS_PAGE_ENTREE = /^\/(que-faire|agenda|ce-week-end)\//
export function AttentePages({ squelette, page }: { squelette: React.ReactNode; page: string }) {
  const pathname = usePathname()
  const [attente, setAttente] = useState(false)
  // `page` change aussi quand seul ?type= change (page de Noël) : le chemin, non.
  useEffect(() => { setAttente(false) }, [pathname, page])
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest('a') : null
      const href = a?.getAttribute('href') ?? ''
      if (VERS_PAGE_ENTREE.test(href) && href !== window.location.pathname + window.location.search) setAttente(true)
    }
    // En capture : le lien de Next annule le clic (navigation douce) avant
    // qu'il ne remonte au document, on le voit donc à la descente.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  // Filet : jamais bloqué derrière l'attente si la page n'arrive pas.
  useEffect(() => {
    if (!attente) return
    const t = setTimeout(() => setAttente(false), 10_000)
    return () => clearTimeout(t)
  }, [attente])
  if (!attente) return null
  return <div style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'hidden' }}>{squelette}</div>
}

export default function OngletsPages({ onglets }: { onglets: Onglet[] }) {
  const pathname = usePathname()
  const [vise, setVise] = useState<string | null>(null)
  // La page visée est arrivée (ou on est revenu) : l'état vient d'elle. La
  // pastille active du serveur change aussi quand seul ?type= change.
  const actifServeur = onglets.find(o => o.actif)?.href
  useEffect(() => { setVise(null) }, [pathname, actifServeur])

  return (
    <nav aria-label="Par type" className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
      {onglets.map(o => {
        const actif = vise ? o.href === vise : !!o.actif
        return (
          <Link
            key={o.href}
            href={o.href}
            onClick={() => setVise(o.href)}
            aria-current={o.actif ? 'page' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              height: 34, padding: '0 13px', borderRadius: 999, textDecoration: 'none',
              fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              background: actif ? '#2D5A3D' : '#fff',
              color: actif ? '#fff' : '#1A1209',
              border: actif ? '1px solid #2D5A3D' : '1px solid #E6DCC8',
              transition: 'background .12s, color .12s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {o.cat && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: (CATEGORIES[o.cat] ?? CATEGORIES.autre).color, boxShadow: actif ? '0 0 0 1.5px #fff' : 'none' }} />}
            {o.label}
            {o.n != null && <span style={{ fontWeight: 500, opacity: 0.7 }}>{o.n}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
