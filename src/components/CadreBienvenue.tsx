'use client'
/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react'
import ClientPortal from '@/components/ClientPortal'

/**
 * LE CADRE DES MESSAGES DE BIENVENUE DANS L'APP (Habitant, Partenaire) —
 * ouverts par leur notification, versions app des mails de Gaëtan.
 *
 * Une carte centrée, cadrée, au-dessus de l'app — pas une feuille qui la
 * recouvre. La croix et la barre du bas sont posées sur le CADRE, hors de la
 * zone qui défile : elles restent sous le doigt jusqu'au bout (une première
 * version accrochait la croix à la bannière, perdue dès qu'on descendait).
 */

export const VERT = '#184D39'
export const ORANGE = '#E14818'
export const ENCRE = '#3C2C20'

/** La police manuscrite des mails (Caveat Brush), via celle de l'app. */
export const manuscrit: React.CSSProperties = { fontFamily: 'var(--font-caveat), "Caveat Brush", cursive', color: ORANGE, lineHeight: 1.2, margin: 0 }

/** Petit titre manuscrit + grand titre, la paire qui ouvre chaque partie. */
export function Surtitre({ petit, grand, marge = '30px 0 2px' }: { petit: string; grand: string; marge?: string }) {
  return (
    <>
      <p style={{ ...manuscrit, fontSize: 22, margin: marge }}>{petit}</p>
      <p style={{ margin: '0 0 14px', fontSize: 21, fontWeight: 900, lineHeight: 1.2, letterSpacing: '-.015em', color: VERT }}>{grand}</p>
    </>
  )
}

/** Une ligne « pastille emoji + titre + texte ». */
export function Avantage({ emoji, fond, titre, texte }: { emoji: string; fond: string; titre: string; texte: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', background: fond, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>{emoji}</div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: '#1A1209' }}>{titre}</span>
        {texte}
      </p>
    </div>
  )
}

export function BoutonPlein({ couleur, onClick, children }: { couleur: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      border: 'none', borderRadius: 999, background: couleur, color: '#fff',
      padding: '14px 26px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    }}>{children}</button>
  )
}

export default function CadreBienvenue({ libelle, onClose, action, children }: {
  libelle: string
  onClose: () => void
  /** Le bouton principal de la barre du bas, à côté de « Fermer ». */
  action: { texte: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <ClientPortal>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(26,18,9,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(18px, env(safe-area-inset-top, 18px)) 16px max(18px, env(safe-area-inset-bottom, 18px))',
      }}>
        <div role="dialog" aria-modal="true" aria-label={libelle} onClick={e => e.stopPropagation()} style={{
          position: 'relative', width: '100%', maxWidth: 440, maxHeight: 'min(82dvh, 760px)',
          backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 18px 50px rgba(26,18,9,.35)',
          fontFamily: 'var(--font-body), sans-serif', color: ENCRE,
        }}>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            position: 'absolute', top: 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,.95)', color: '#1A1209', fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,.25)',
          }}>✕</button>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            <img src="/email/banniere-la-place.jpg" alt="La Place : le bouche à oreille, enfin organisé !" style={{ display: 'block', width: '100%', height: 'auto', background: VERT }} />
            <div style={{ padding: '22px 20px 22px' }}>{children}</div>
          </div>

          <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '12px 16px 14px', borderTop: '1px solid #F0EAE0', background: '#fff' }}>
            <button type="button" onClick={onClose} style={{
              flex: '0 0 auto', border: '1.5px solid #E0D8CE', borderRadius: 999, background: '#fff', color: '#6B5E4E',
              padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}>Fermer</button>
            <button type="button" onClick={action.onClick} style={{
              flex: 1, border: 'none', borderRadius: 999, background: ORANGE, color: '#fff',
              padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}>{action.texte}</button>
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}
