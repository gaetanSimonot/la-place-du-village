'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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

/**
 * Le choix de la commune (page de Noël) : un bouton « 📍 Toutes les communes ▾ »
 * qui ouvre la liste native du téléphone — la plus pratique pour une
 * centaine de noms. Les plus fournies d'abord, avec leur nombre de rendez-vous.
 */
export function FiltreCommune({ communes, actuelle, toutes }: {
  communes: { slug: string; nom: string; n: number; href: string }[]
  actuelle: { slug: string; nom: string } | null
  toutes: { href: string; n: number }
}) {
  const router = useRouter()
  const [enCours, setEnCours] = useState(false)
  useEffect(() => { setEnCours(false) }, [actuelle?.slug])
  return (
    <div className="mt-2.5 px-4">
      <label style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%',
        height: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
        background: actuelle ? '#2D5A3D' : '#fff', color: actuelle ? '#fff' : '#1A1209',
        border: actuelle ? '1px solid #2D5A3D' : '1px solid #E6DCC8',
        fontSize: 13, fontWeight: 700, opacity: enCours ? 0.6 : 1,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {enCours ? 'Chargement…' : actuelle ? actuelle.nom : 'Toutes les communes'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
        {/* La vraie liste, invisible, par-dessus le bouton : le toucher l'ouvre. */}
        <select
          aria-label="Choisir la commune"
          value={actuelle?.slug ?? ''}
          onChange={e => {
            const v = e.target.value
            const cible = v ? communes.find(c => c.slug === v)?.href : toutes.href
            if (cible) { setEnCours(true); router.push(cible) }
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', fontSize: 16 }}
        >
          <option value="">Toutes les communes ({toutes.n})</option>
          {communes.map(c => <option key={c.slug} value={c.slug}>{c.nom} ({c.n})</option>)}
        </select>
      </label>
    </div>
  )
}
