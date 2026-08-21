'use client'
import { useEffect, useState } from 'react'
import ClientPortal from '@/components/ClientPortal'
import { usePushNotifications } from '@/hooks/usePushNotifications'

/**
 * Pop-up d'incitation à activer les notifications push — refonte visuelle.
 * La LOGIQUE est identique à la version précédente (mêmes clés, même snooze,
 * mêmes conditions d'affichage) : seul le rendu change.
 *
 * Trois rendus :
 *   - reason 'general'            → carte sobre, cloche du profil
 *   - reason 'event'              → aperçu de la notification qu'on recevrait
 *   - state 'ios-needs-install'   → les deux gestes iOS écrits, puis /app
 */
const DONE_KEY = 'pdv-push-prompt-done'

/**
 * A-t-on déjà obtenu un oui de cette personne ?
 *
 * Posé une seule fois, à la première activation réussie, et jamais effacé —
 * y compris si elle désactive ensuite depuis les réglages. C'est délibéré :
 * couper les notifications est un choix explicite, on ne revient pas le lui
 * demander. Toute nouvelle invitation à activer doit consulter ce drapeau.
 */
export function pushDejaAccepte(): boolean {
  try { return !!localStorage.getItem(DONE_KEY) } catch { return false }
}
const SNOOZE_KEY = 'pdv-push-prompt-snooze-v2'
const SNOOZE_MS = 12 * 24 * 60 * 60 * 1000

export type PushPromptReason = 'general' | 'event'

/* ── tokens (identiques à tailwind.config.ts) ───────────────────────── */
const C = {
  primary: '#2D5A3D', primaryLight: '#E8F2EB',
  accent: '#C84B2F', accentSoft: '#FFF0E5',
  cremeDeep: '#F7F1E6', texte: '#1A1209', doux: '#7A6A5A', tresDoux: '#A99B89',
  bordSoft: '#F0EAE0',
}

export default function PushPromptModal({ reason = 'general', delayMs = 0 }: {
  reason?: PushPromptReason
  delayMs?: number
} = {}) {
  const { state, busy, enable } = usePushNotifications()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state === 'loading') return
    if (state !== 'off' && state !== 'ios-needs-install') return
    try {
      if (localStorage.getItem(DONE_KEY)) return
      const snooze = Number(localStorage.getItem(SNOOZE_KEY) || 0)
      if (Date.now() < snooze) return
    } catch { return }
    if (!delayMs) { setOpen(true); return }
    const t = setTimeout(() => setOpen(true), delayMs)
    return () => clearTimeout(t)
  }, [state, delayMs])

  if (!open) return null

  const iosInstall = state === 'ios-needs-install'

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)) } catch { /* noop */ }
    setOpen(false)
  }

  const act = async () => {
    if (iosInstall) { window.location.href = '/app'; return }
    const ok = await enable()
    if (ok) { try { localStorage.setItem(DONE_KEY, '1') } catch { /* noop */ } }
    setOpen(false)
  }

  const ctaLabel = busy ? '…'
    : iosInstall ? 'Voir comment faire'
    : reason === 'event' ? 'Me le rappeler'
    : 'Activer'

  return (
    <ClientPortal>
      <div
        onClick={later}
        style={{
          position: 'fixed', inset: 0, zIndex: 3500,
          background: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 18, fontFamily: 'var(--font-body), sans-serif',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative', width: '100%', maxWidth: 330,
            background: '#fff', borderRadius: 22, padding: '22px 20px 18px',
            boxShadow: '0 18px 50px rgba(26,18,9,0.35)', textAlign: 'center',
          }}
        >
          <button
            onClick={later}
            aria-label="Fermer"
            style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: C.tresDoux, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {iosInstall ? <IosBody /> : reason === 'event' ? <EventBody /> : <GeneralBody />}

          <button
            onClick={act}
            disabled={busy}
            style={{
              width: '100%', boxSizing: 'border-box', marginTop: 18, padding: '14px 18px',
              border: 'none', borderRadius: 14, background: C.primary, color: '#fff',
              fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1, boxShadow: '0 4px 14px rgba(45,90,61,0.28)',
            }}
          >
            {ctaLabel}
          </button>
          <button
            onClick={later}
            style={{ width: '100%', marginTop: 6, padding: 11, border: 'none', background: 'none', color: C.doux, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Plus tard
          </button>
        </div>
      </div>
    </ClientPortal>
  )
}

/* ── A · demande générale ───────────────────────────────────────────── */
function GeneralBody() {
  return (
    <>
      <Pastille bg={C.primaryLight} fg={C.primary}><BellIcon size={26} /></Pastille>
      <Title>Le village vous prévient</Title>
      <Sub>Un message, une réponse à votre annonce, un événement qui vous intéresse : votre téléphone vous le dit sur le moment.</Sub>
    </>
  )
}

/* ── B · depuis une fiche événement ─────────────────────────────────── */
function EventBody() {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.primary }}>
        Ce que vous recevriez
      </div>
      <div style={{ margin: '10px 0 4px' }}>
        <Toast
          icon={<HeartIcon />}
          iconBg={C.accentSoft}
          iconFg={C.accent}
          title="C'est demain, 21h"
          sub="Concert sur la place de la Mairie"
          time="hier"
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <Title>Ne ratez plus une sortie</Title>
        <Sub>Mettez un événement en favori et votre téléphone vous le rappelle la veille. Rien d&apos;autre, promis.</Sub>
      </div>
    </>
  )
}

/* ── B · iOS à installer ────────────────────────────────────────────── */
function IosBody() {
  return (
    <>
      <Pastille bg={C.cremeDeep} fg={C.primary}>
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="13 6 19 12 13 18" /><path d="M19 12H8a4 4 0 0 0-4 4v2" />
        </svg>
      </Pastille>
      <Title>Ajoutez l&apos;app à votre écran</Title>
      <Sub>Sur iPhone, les rappels ne marchent qu&apos;une fois l&apos;app installée. C&apos;est deux gestes, et elle s&apos;ouvre comme une vraie app.</Sub>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12, textAlign: 'left' }}>
        <Benefit
          icon={<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><polyline points="13 6 19 12 13 18" /><path d="M19 12H8a4 4 0 0 0-4 4v2" /></svg>}
          title="Touchez Partager"
          sub="En bas de Safari"
        />
        <Benefit
          icon={<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
          title="Sur l'écran d'accueil"
          sub="C'est fini"
          first={false}
        />
      </div>
    </>
  )
}

/* ── briques ────────────────────────────────────────────────────────── */
function Pastille({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 56, height: 56, margin: '2px auto 14px', borderRadius: 18, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display), sans-serif', fontWeight: 800, fontSize: 20, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.texte }}>
      {children}
    </h2>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.doux }}>{children}</p>
}

function Toast({ icon, iconBg, iconFg, title, sub, time }: {
  icon: React.ReactNode; iconBg: string; iconFg: string
  title: string; sub: string; time: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', background: '#fff', border: `1px solid ${C.bordSoft}`, borderRadius: 14, padding: '10px 12px', boxShadow: '0 6px 18px rgba(44,28,16,0.10)' }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: iconBg, color: iconFg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, letterSpacing: '-0.005em', color: C.texte }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.doux, marginTop: 1, lineHeight: 1.35 }}>{sub}</span>
      </span>
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.tresDoux }}>{time}</span>
    </div>
  )
}

function Benefit({ icon, title, sub, first = true }: {
  icon: React.ReactNode; title: string; sub: string; first?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px', borderTop: first ? 'none' : `1px solid ${C.bordSoft}` }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: C.primaryLight, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, letterSpacing: '-0.005em', color: C.texte }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.doux, marginTop: 1 }}>{sub}</span>
      </span>
    </div>
  )
}

/** Cloche — identique à celle de ProfilHeader (ActionIconBtn). */
function BellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/** Cœur « favori » — identique à PostCard. */
function HeartIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
