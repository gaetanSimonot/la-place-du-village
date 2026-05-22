'use client'
import Link from 'next/link'
import BottomNavBar from '@/components/BottomNavBar'

interface Props {
  title:    string
  updated:  string
  children: React.ReactNode
}

/**
 * Layout commun aux pages légales (mentions, confidentialité, CGU).
 * Top bar back vers / + titre DM Serif + date de mise à jour.
 */
export default function LegalPageLayout({ title, updated, children }: Props) {
  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      <div
        className="flex items-center gap-2.5 px-4 pt-3.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}
      >
        <Link
          href="/"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border bg-white text-texte"
          style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <h1 className="m-0 flex-1 truncate font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.005em' }}>
          {title}
        </h1>
        <div className="h-10 w-10 shrink-0" aria-hidden />
      </div>

      <article className="px-5 pt-5">
        <p className="m-0 mb-5 text-[11px] uppercase text-texte-tres-doux" style={{ letterSpacing: '0.08em' }}>
          Dernière mise à jour : {updated}
        </p>

        <div className="prose-legal flex flex-col gap-4 text-[13.5px] leading-[1.65] text-texte">
          {children}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border-t pt-6" style={{ borderColor: '#F0EAE0' }}>
          <p className="m-0 text-center text-[12px] text-texte-doux">
            Une question ? Une demande relative à tes données ?
          </p>
          <Link
            href="/support"
            className="rounded-full bg-primary px-4 py-2 text-[12.5px] font-extrabold text-white no-underline"
          >
            Contacter le support
          </Link>
        </div>

        <nav className="mt-8 flex flex-wrap justify-center gap-4 text-[11.5px] font-bold text-texte-doux">
          <Link href="/mentions-legales" className="no-underline hover:underline">Mentions légales</Link>
          <Link href="/politique-confidentialite" className="no-underline hover:underline">Confidentialité</Link>
          <Link href="/cgu" className="no-underline hover:underline">CGU</Link>
        </nav>
      </article>

      <BottomNavBar />
    </main>
  )
}

/* ── Sous-composants helper pour les pages légales ──────────────────── */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 mt-2 font-serif text-[18px] text-texte" style={{ letterSpacing: '-0.005em' }}>
        {title}
      </h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  )
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="m-0">{children}</p>
}

export function LegalUL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 py-1">
          <span className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}
