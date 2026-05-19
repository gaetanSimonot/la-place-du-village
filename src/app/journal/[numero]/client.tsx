'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export interface JournalRow {
  id: string
  numero: number
  date_parution: string
  semaine_du: string
  semaine_au: string
  cover_kicker: string
  cover_titre: string
  cover_deck: string
  cover_image_url: string | null
  meteo: { temp?: number; vent?: string; conditions?: string } | null
  billet_titre: string | null
  billet_corps: string | null
  saviez_vous: string | null
  temps_lecture_min: number | null
  publie_at: string | null
}

export interface ArchiveEntry {
  numero: number
  cover_titre: string
  date_parution: string
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function JournalPageClient({ row, archives }: { row: JournalRow; archives: ArchiveEntry[] }) {
  const router = useRouter()

  function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = `Journal du Village n°${row.numero} — ${row.cover_titre}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ title, text: row.cover_deck, url }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {})
    }
  }

  return (
    <main className="min-h-screen bg-creme pb-16 font-inter">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Retour"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-bord bg-white text-texte"
          style={{ boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <div className="text-[12px] font-bold text-texte" style={{ letterSpacing: '0.04em' }}>
            Journal du Village · N°{row.numero}
          </div>
          <div className="text-[10px] font-semibold text-texte-doux">
            {formatDateLong(row.date_parution)}
          </div>
        </div>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Partager"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-bord bg-white text-texte"
          style={{ boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>

      {/* ── Masthead ───────────────────────────────────────────────────── */}
      <header
        className="mx-4 mt-4 border-b border-bord bg-creme px-4 pb-3.5 pt-4 text-center"
        style={{ borderTop: '3px solid #1A1209' }}
      >
        <div
          className="font-serif leading-[0.92] text-texte"
          style={{ fontSize: 38, letterSpacing: '-0.03em' }}
        >
          La Place
          <br />
          du Village
        </div>
        <div className="mt-2 text-[10px] font-extrabold tracking-[0.22em] text-texte-doux">
          L&apos;HEBDO LOCAL · SUD CÉVENNES
        </div>
        <div className="mt-1 text-[10px] font-medium text-texte-tres-doux">
          Semaine du {formatDateShort(row.semaine_du)} au {formatDateShort(row.semaine_au)} ·
          {' '}{row.temps_lecture_min ?? 5} min de lecture
        </div>
      </header>

      {/* ── Cover article ──────────────────────────────────────────────── */}
      <section className="px-4 pt-7">
        <div className="text-[10px] font-extrabold tracking-[0.16em] text-accent">
          ★ {row.cover_kicker}
        </div>
        <h1
          className="mt-2 font-serif leading-[1.05] text-texte"
          style={{ fontSize: 30, letterSpacing: '-0.02em' }}
        >
          {row.cover_titre}
        </h1>
        <p
          className="mt-3 font-serif italic text-texte-doux"
          style={{ fontFamily: 'var(--font-caveat), "Crimson Pro", Georgia, serif', fontSize: 16, lineHeight: 1.5 }}
        >
          {row.cover_deck}
        </p>
        {row.cover_image_url && (
          <div
            className="mt-4 overflow-hidden rounded-[16px] bg-bord/40"
            style={{ height: 240, boxShadow: '0 6px 24px rgba(44,28,16,0.18)' }}
          >
            <img src={row.cover_image_url} alt={row.cover_titre} className="h-full w-full object-cover" />
          </div>
        )}
      </section>

      {/* ── Météo ──────────────────────────────────────────────────────── */}
      {row.meteo && (row.meteo.temp != null || row.meteo.conditions) && (
        <section className="mx-4 mt-6 rounded-[14px] border border-bordSoft bg-white px-4 py-3.5">
          <div className="text-[9px] font-extrabold tracking-[0.16em] text-texte-doux">
            LA MÉTÉO DE LA SEMAINE
          </div>
          <div className="mt-2 flex items-center gap-5">
            {row.meteo.temp != null && (
              <div className="flex items-center gap-2">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8B27A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4.5" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                  <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                  <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                </svg>
                <span className="font-serif text-[22px] text-texte">{row.meteo.temp}°</span>
              </div>
            )}
            {row.meteo.conditions && (
              <span className="text-[12px] text-texte-doux">{row.meteo.conditions}</span>
            )}
            {row.meteo.vent && (
              <span className="text-[12px] text-texte-doux">· {row.meteo.vent}</span>
            )}
          </div>
        </section>
      )}

      {/* ── Le Billet (éditorial dropcap) ──────────────────────────────── */}
      {row.billet_corps && (
        <section className="px-4 pt-8">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-accent">
            LE BILLET
          </div>
          {row.billet_titre && (
            <h2
              className="mt-1 font-serif leading-[1.1] text-texte"
              style={{ fontSize: 22, letterSpacing: '-0.02em' }}
            >
              {row.billet_titre}
            </h2>
          )}
          <div
            className="mt-3 text-[15px] leading-[1.65] text-texte"
            style={{ fontFamily: 'Georgia, "Crimson Pro", serif' }}
          >
            <BilletBody body={row.billet_corps} />
          </div>
        </section>
      )}

      {/* ── Le saviez-vous ? ───────────────────────────────────────────── */}
      {row.saviez_vous && (
        <section
          className="mx-4 mt-8 rounded-[16px] border-l-[3px] border-accent px-4 py-4"
          style={{ background: '#FFF0E5' }}
        >
          <div className="text-[10px] font-extrabold tracking-[0.16em] text-accent">
            LE SAVIEZ-VOUS ?
          </div>
          <p
            className="mt-2 font-serif text-[15px] leading-[1.5] text-texte"
            style={{ fontStyle: 'italic' }}
          >
            {row.saviez_vous}
          </p>
        </section>
      )}

      {/* ── Archives ───────────────────────────────────────────────────── */}
      {archives.length > 0 && (
        <section className="px-4 pt-10">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-texte-doux">
            ARCHIVES
          </div>
          <h2
            className="mt-1 font-serif leading-[1.1] text-texte"
            style={{ fontSize: 22, letterSpacing: '-0.02em' }}
          >
            Les numéros précédents
          </h2>
          <ul className="mt-3 divide-y divide-bordSoft border-y border-bordSoft">
            {archives.map(a => (
              <li key={a.numero}>
                <Link
                  href={`/journal/${a.numero}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-extrabold tracking-[0.12em] text-texte-doux">
                      N°{a.numero} · {formatDateShort(a.date_parution)}
                    </div>
                    <div
                      className="mt-1 truncate font-serif text-[15px] text-texte"
                      style={{ letterSpacing: '-0.01em' }}
                    >
                      {a.cover_titre}
                    </div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-doux">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Pied ───────────────────────────────────────────────────────── */}
      <footer className="mt-12 px-4 text-center text-[11px] text-texte-tres-doux">
        Journal du Village · Édition n°{row.numero}
        <br />
        Publié le {formatDateLong(row.date_parution)}
      </footer>
    </main>
  )
}

/* ─── Billet body avec dropcap sur 1er paragraphe ─────────────────────── */

function BilletBody({ body }: { body: string }) {
  const paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return null
  return (
    <>
      {paragraphs.map((p, i) => {
        if (i === 0) {
          const first = p.charAt(0)
          const rest = p.slice(1)
          return (
            <p key={i} className="mb-4">
              <span
                className="float-left mr-2 font-serif text-accent"
                style={{
                  fontSize: 56,
                  lineHeight: 0.85,
                  paddingTop: 4,
                  letterSpacing: '-0.04em',
                }}
              >
                {first}
              </span>
              {rest}
            </p>
          )
        }
        return <p key={i} className="mb-4">{p}</p>
      })}
    </>
  )
}
