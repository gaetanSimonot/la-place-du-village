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
  selection_event_ids: string[] | null
  selection_annonce_ids: string[] | null
  selection_bonplan_ids: string[] | null
  selection_article_id: string | null
  spotlight_etab_id: string | null
  temps_lecture_min: number | null
  publie_at: string | null
}

export interface ArchiveEntry {
  numero: number
  cover_titre: string
  date_parution: string
}

export interface EventEntry {
  id: string
  titre: string
  image_url: string | null
  date_debut: string | null
  heure: string | null
  categorie: string | null
  lieux: { nom: string | null; commune: string | null } | null
}

export interface AnnonceEntry {
  id: string
  titre: string
  description: string | null
  photos: string[] | null
  type: string
  prix_initial: number | null
  prix_actuel: number | null
  ville: string | null
}

export interface PromoEntry {
  id: string
  title: string
  description: string | null
  image_url: string | null
  etablissement_id: string | null
  etablissements: { nom: string | null; commune: string | null } | null
}

export interface SpotlightEntry {
  id: string
  nom: string
  commune: string | null
  type: string | null
  photos: string[] | null
  description_courte: string | null
}

export interface ArticleEntry {
  id: string
  titre: string
  corps: string
  photo_url: string | null
  user_id: string | null
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

interface JournalProps {
  row: JournalRow
  archives: ArchiveEntry[]
  events?: EventEntry[]
  annonces?: AnnonceEntry[]
  promos?: PromoEntry[]
  article?: ArticleEntry | null
  spotlight?: SpotlightEntry | null
}

export default function JournalPageClient({
  row, archives,
  events = [], annonces = [], promos = [], article = null, spotlight = null,
}: JournalProps) {
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

      {/* ── Spotlight établissement ────────────────────────────────────── */}
      {spotlight && (
        <section className="px-4 pt-10">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-primary">
            COUP DE PROJECTEUR
          </div>
          <h2
            className="mt-1 font-serif leading-[1.1] text-texte"
            style={{ fontSize: 24, letterSpacing: '-0.02em' }}
          >
            {spotlight.nom}
          </h2>
          <div className="mt-1 text-[12px] text-texte-doux">
            {[spotlight.type, spotlight.commune].filter(Boolean).join(' · ')}
          </div>
          {spotlight.photos?.[0] && (
            <div
              className="mt-3 overflow-hidden rounded-[14px] bg-bord/40"
              style={{ height: 180, boxShadow: '0 4px 16px rgba(44,28,16,0.12)' }}
            >
              <img src={spotlight.photos[0]} alt={spotlight.nom} className="h-full w-full object-cover" />
            </div>
          )}
          {spotlight.description_courte && (
            <p className="mt-3 text-[14px] leading-[1.6] text-texte">{spotlight.description_courte}</p>
          )}
          <Link
            href={`/etablissement/${spotlight.id}`}
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-primary"
          >
            Voir la fiche →
          </Link>
        </section>
      )}

      {/* ── Événements de la semaine ───────────────────────────────────── */}
      {events.length > 0 && (
        <section className="px-4 pt-10">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-accent">
            AGENDA DE LA SEMAINE
          </div>
          <h2 className="mt-1 font-serif leading-[1.1] text-texte" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>
            Ce qu&apos;il ne faut pas manquer
          </h2>
          <ul className="mt-4 divide-y divide-bordSoft border-y border-bordSoft">
            {events.map(e => (
              <li key={e.id}>
                <Link href={`/evenement/${e.id}`} className="flex items-center gap-3 py-3">
                  {e.image_url && (
                    <img src={e.image_url} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-extrabold tracking-[0.1em] text-texte-doux">
                      {[e.date_debut, e.heure?.slice(0, 5), e.categorie].filter(Boolean).join(' · ')}
                    </div>
                    <div className="mt-1 truncate font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                      {e.titre}
                    </div>
                    {(e.lieux?.nom || e.lieux?.commune) && (
                      <div className="mt-0.5 truncate text-[11px] text-texte-doux">
                        {[e.lieux?.nom, e.lieux?.commune].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Article d'habitant ─────────────────────────────────────────── */}
      {article && (
        <section className="px-4 pt-10">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-primary">
            L&apos;ARTICLE DE LA SEMAINE
          </div>
          <h2
            className="mt-1 font-serif leading-[1.1] text-texte"
            style={{ fontSize: 24, letterSpacing: '-0.02em' }}
          >
            {article.titre}
          </h2>
          {article.photo_url && (
            <div
              className="mt-3 overflow-hidden rounded-[14px] bg-bord/40"
              style={{ height: 200, boxShadow: '0 4px 16px rgba(44,28,16,0.12)' }}
            >
              <img src={article.photo_url} alt={article.titre} className="h-full w-full object-cover" />
            </div>
          )}
          <div
            className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.65] text-texte"
            style={{ fontFamily: 'Georgia, "Crimson Pro", serif' }}
          >
            {article.corps}
          </div>
        </section>
      )}

      {/* ── Bons plans ─────────────────────────────────────────────────── */}
      {promos.length > 0 && (
        <section className="px-4 pt-10">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-accent">
            BONS PLANS DES COMMERÇANTS
          </div>
          <ul className="mt-3 divide-y divide-bordSoft border-y border-bordSoft">
            {promos.map(p => (
              <li key={p.id}>
                <Link href={`/promotions?id=${p.id}`} className="flex items-center gap-3 py-3">
                  {p.image_url && (
                    <img src={p.image_url} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-extrabold tracking-[0.1em] text-[#E8622A]">BON PLAN</div>
                    <div className="mt-1 truncate font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                      {p.title}
                    </div>
                    {p.etablissements?.nom && (
                      <div className="mt-0.5 truncate text-[11px] text-texte-doux">
                        chez {p.etablissements.nom}{p.etablissements.commune ? ` · ${p.etablissements.commune}` : ''}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Petites annonces ───────────────────────────────────────────── */}
      {annonces.length > 0 && (
        <section className="px-4 pt-10">
          <div className="text-[10px] font-extrabold tracking-[0.18em] text-accent">
            PETITES ANNONCES
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {annonces.map(a => (
              <li key={a.id}>
                <Link
                  href={`/annonces/${a.id}`}
                  className="block overflow-hidden rounded-[12px] border border-bordSoft bg-white"
                >
                  {a.photos?.[0] && (
                    <img src={a.photos[0]} alt="" className="h-24 w-full object-cover" />
                  )}
                  <div className="px-2.5 py-2">
                    <div className="truncate text-[12px] font-bold text-texte" style={{ letterSpacing: '-0.01em' }}>
                      {a.titre}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-texte-doux">
                      {[
                        a.prix_actuel ?? a.prix_initial ? `${a.prix_actuel ?? a.prix_initial} €` : null,
                        a.ville,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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
