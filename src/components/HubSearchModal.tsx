'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface EvenementRow {
  id: string
  titre: string
  image_url: string | null
  date_debut: string | null
  heure: string | null
  lieux: { nom: string | null; commune: string | null } | null
}
interface EtablissementRow {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
  type: string | null
}
interface ProducteurRow {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
}

interface Results {
  evenements:     EvenementRow[]
  etablissements: EtablissementRow[]
  producteurs:    ProducteurRow[]
}

function dateLabel(iso: string | null): string {
  if (!iso) return ''
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(iso); d.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0)  return "Aujourd'hui"
  if (diff === 1)  return 'Demain'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const ESC_OR = (s: string) => s.replace(/,/g, '\\,').replace(/\)/g, '\\)').replace(/\(/g, '\\(')

interface Props {
  open:    boolean
  onClose: () => void
}

export default function HubSearchModal({ open, onClose }: Props) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset à l'ouverture + autofocus
  useEffect(() => {
    if (open) {
      setQ('')
      setResults(null)
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  // ESC pour fermer
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Recherche debouncée
  useEffect(() => {
    if (!open) return
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const term = `%${ESC_OR(trimmed)}%`
      const [evRes, etabRes, prodRes] = await Promise.all([
        supabase.from('evenements')
          .select('id, titre, image_url, date_debut, heure, lieux(nom, commune)')
          .eq('statut', 'publie')
          .ilike('titre', term)
          .order('date_debut', { ascending: true })
          .limit(6),
        supabase.from('etablissements')
          .select('id, nom, commune, photos, type')
          .or(`nom.ilike.${term},commune.ilike.${term}`)
          .limit(6),
        supabase.from('producers')
          .select('id, nom, commune, photos')
          .or(`nom.ilike.${term},commune.ilike.${term}`)
          .limit(6),
      ])
      if (cancelled) return
      setResults({
        evenements:     (evRes.data   ?? []) as unknown as EvenementRow[],
        etablissements: (etabRes.data ?? []) as EtablissementRow[],
        producteurs:    (prodRes.data ?? []) as ProducteurRow[],
      })
      setLoading(false)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, open])

  if (!open) return null

  const totalCount =
    (results?.evenements.length ?? 0) +
    (results?.etablissements.length ?? 0) +
    (results?.producteurs.length ?? 0)

  const goto = (path: string) => {
    onClose()
    router.push(path)
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-creme font-inter">
      {/* Header — close + input */}
      <div className="flex items-center gap-2.5 border-b border-bord bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div className="flex h-10 flex-1 items-center gap-2.5 rounded-[14px] border border-bord bg-creme px-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-doux">
            <circle cx="11" cy="11" r="7"/>
            <line x1="16.5" y1="16.5" x2="21" y2="21"/>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 border-none bg-transparent text-[14px] text-texte outline-none placeholder:text-texte-tres-doux"
            type="search"
            inputMode="search"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(''); inputRef.current?.focus() }}
              aria-label="Effacer"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bord text-texte-doux"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-6">
        {/* État vide — pas de query */}
        {q.trim().length < 2 && (
          <div className="px-6 pt-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/>
                <line x1="16.5" y1="16.5" x2="21" y2="21"/>
              </svg>
            </div>
            <p className="m-0 text-[13px] text-texte-doux">
              Tape quelques lettres pour rechercher dans les{' '}
              <span className="font-semibold text-texte">événements</span>, les{' '}
              <span className="font-semibold text-texte">commerces</span> et les{' '}
              <span className="font-semibold text-texte">producteurs</span>.
            </p>
          </div>
        )}

        {/* Loader */}
        {q.trim().length >= 2 && loading && !results && (
          <div className="px-6 pt-10 text-center text-[13px] text-texte-doux">
            Recherche en cours…
          </div>
        )}

        {/* Résultats */}
        {results && (
          <>
            {results.evenements.length > 0 && (
              <ResultSection
                icon={<IconCalendar />}
                title="Événements"
                count={results.evenements.length}
              >
                {results.evenements.map(e => (
                  <ResultRow
                    key={e.id}
                    onClick={() => goto(`/evenement/${e.id}`)}
                    photo={e.image_url}
                    fallbackIcon={<IconCalendar size={22} />}
                    title={e.titre}
                    metaIcon={<IconPin size={11} />}
                    meta={e.lieux?.nom ?? e.lieux?.commune ?? null}
                    tail={dateLabel(e.date_debut)}
                  />
                ))}
              </ResultSection>
            )}

            {results.etablissements.length > 0 && (
              <ResultSection
                icon={<IconStore />}
                title="Commerces"
                count={results.etablissements.length}
              >
                {results.etablissements.map(et => (
                  <ResultRow
                    key={et.id}
                    onClick={() => goto(`/etablissement/${et.id}`)}
                    photo={et.photos?.[0] ?? null}
                    fallbackIcon={<IconStore size={22} />}
                    title={et.nom}
                    metaIcon={<IconPin size={11} />}
                    meta={et.commune}
                  />
                ))}
              </ResultSection>
            )}

            {results.producteurs.length > 0 && (
              <ResultSection
                icon={<IconLeaf />}
                title="Producteurs"
                count={results.producteurs.length}
              >
                {results.producteurs.map(p => (
                  <ResultRow
                    key={p.id}
                    onClick={() => goto(`/producteur/${p.id}`)}
                    photo={p.photos?.[0] ?? null}
                    fallbackIcon={<IconLeaf size={22} />}
                    title={p.nom}
                    metaIcon={<IconPin size={11} />}
                    meta={p.commune}
                  />
                ))}
              </ResultSection>
            )}

            {totalCount === 0 && !loading && (
              <div className="px-6 pt-10 text-center text-[13px] text-texte-doux">
                Aucun résultat pour «&nbsp;<span className="font-semibold text-texte">{q}</span>&nbsp;».
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function ResultSection({
  icon, title, count, children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="pt-2">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="inline-flex shrink-0 text-primary">{icon}</span>
        <h3 className="m-0 text-[14px] font-extrabold tracking-tight2 text-texte">{title}</h3>
        <span className="rounded-full bg-bord/40 px-[7px] py-0.5 text-[11px] font-bold text-texte-doux">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4">{children}</div>
    </section>
  )
}

function ResultRow({
  onClick, photo, fallbackIcon, title, metaIcon, meta, tail,
}: {
  onClick:       () => void
  photo:         string | null
  fallbackIcon:  React.ReactNode
  title:         string
  metaIcon?:     React.ReactNode
  meta?:         string | null
  tail?:         string | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[14px] border border-bord bg-white p-2.5 text-left"
    >
      <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-bord/40 text-texte-doux">
        {photo
          ? <img src={photo} alt="" className="h-full w-full object-cover" />
          : fallbackIcon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-[13px] font-bold leading-[1.25] text-texte">{title}</div>
        {meta && (
          <div className="mt-[3px] flex items-center gap-[3px] overflow-hidden text-[11px] text-texte-doux">
            {metaIcon}
            <span className="truncate">{meta}</span>
          </div>
        )}
        {tail && (
          <div className="mt-[3px] text-[11px] font-bold text-primary">{tail}</div>
        )}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-tres-doux">
        <polyline points="9 6 15 12 9 18"/>
      </svg>
    </button>
  )
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

const IconCalendar = ({ size = 17 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconStore = ({ size = 17 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l2-5h14l2 5"/>
    <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/>
    <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>
  </svg>
)
const IconLeaf = ({ size = 17 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 6c-6.5 0-12 5.5-12 12 0 1 0 2 .5 3-1.5-1.5-3-4-3-7 0-5 4-9 9-9 1 0 2 0 3 .5C18.5 5 19.5 5 21 6z"/>
    <path d="M9 18c0-5 4-9 9-9"/>
  </svg>
)
const IconPin = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)
