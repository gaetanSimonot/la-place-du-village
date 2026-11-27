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
export default function OngletsPages({ onglets }: { onglets: Onglet[] }) {
  const pathname = usePathname()
  const [vise, setVise] = useState<string | null>(null)
  // La page visée est arrivée (ou on est revenu) : l'état vient d'elle.
  useEffect(() => { setVise(null) }, [pathname])

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
