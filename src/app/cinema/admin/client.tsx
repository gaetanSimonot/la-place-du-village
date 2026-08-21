'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import ClientPortal from '@/components/ClientPortal'
import { VERSIONS, dateParis, formatHeure, type Film, type VersionFilm } from '@/lib/cinema'

/**
 * « Mon cinéma » — l'exploitant gère sa programmation.
 *
 * Volontairement pauvre en écrans : trois compteurs, la liste des séances, et
 * un bouton pour ajouter. Un exploitant doit comprendre sans formation.
 *
 * Cette version ne fait que la saisie manuelle. L'import par photo et la
 * dictée viendront se brancher sur le même enregistrement de séances.
 */

interface SeanceAdmin {
  id: string
  film_id: string
  date: string
  heure: string
  version: VersionFilm
  salle: string | null
  note: string | null
}
interface Payload {
  cinema: { id: string; nom: string; commune: string | null; slug: string | null } | null
  films: Film[]
  seances: SeanceAdmin[]
}

async function authedFetch(url: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
}
const fetcher = (u: string) => authedFetch(u).then(r => r.json())

function jourLisible(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function MonCinemaClient() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [cinemaId, setCinemaId] = useState<string | null>(null)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  /** Filtre de la liste, piloté par les quatre entrées de programmation. */
  const [vue, setVue] = useState<'affiche' | 'semaine' | 'prochainement'>('affiche')

  useEffect(() => {
    try { setCinemaId(new URLSearchParams(window.location.search).get('cinema')) } catch { /* noop */ }
  }, [])
  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/cinema/admin')
  }, [authLoading, user, openAuthModal])

  const key = !authLoading && user ? `/api/cinema/admin${cinemaId ? `?cinema=${cinemaId}` : ''}` : null
  const { data, isLoading, mutate } = useSWR<Payload>(key, fetcher)

  const films = useMemo(() => new Map((data?.films ?? []).map(f => [f.id, f])), [data])
  // useMemo : sans lui, `?? []` produit un tableau neuf à chaque rendu.
  const seances = useMemo<SeanceAdmin[]>(() => data?.seances ?? [], [data])
  const aujourdhui = dateParis()
  const dans7 = dateParis(7)

  const compteurs = useMemo(() => {
    const aVenir = seances.filter(s => s.date >= aujourdhui)
    return {
      films:   new Set(aVenir.map(s => s.film_id)).size,
      semaine: aVenir.filter(s => s.date <= dans7).length,
      total:   aVenir.length,
    }
  }, [seances, aujourdhui, dans7])

  const parJour = useMemo(() => {
    const retenues = seances.filter(x => {
      if (x.date < aujourdhui) return false
      if (vue === 'semaine')       return x.date <= dans7
      if (vue === 'prochainement') return x.date > dans7
      return true
    })
    const m = new Map<string, SeanceAdmin[]>()
    for (const s of retenues) { const l = m.get(s.date) ?? []; l.push(s); m.set(s.date, l) }
    return Array.from(m.entries())
  }, [seances, aujourdhui, dans7, vue])

  async function supprimer(id: string) {
    const res = await authedFetch(`/api/cinema/admin?seance=${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) { toast.error('Suppression impossible.'); return }
    void mutate()
  }

  if (!authLoading && !user) {
    return <Coquille titre="Mon cinéma"><Message titre="Connexion requise" texte="Connectez-vous pour gérer votre programmation." /></Coquille>
  }
  if (isLoading) {
    return <Coquille titre="Mon cinéma"><div className="flex justify-center py-16"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-bord border-t-primary" /></div></Coquille>
  }
  if (!data?.cinema) {
    return (
      <Coquille titre="Mon cinéma">
        <Message
          titre="Module non accordé"
          texte="Cet espace s’ouvre quand la fiche est revendiquée, l’abonnement Pro actif et le module Cinéma accordé par La Place du Village."
        />
      </Coquille>
    )
  }

  return (
    <Coquille titre={data.cinema.nom} sousTitre={data.cinema.commune ?? undefined} onRetour={() => router.back()}>
      {/* Trois compteurs — l'état de la programmation en un coup d'œil */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-3.5">
        <Compteur n={compteurs.films}   label="films à l’affiche" />
        <Compteur n={compteurs.semaine} label="séances cette semaine" />
        <Compteur n={compteurs.total}   label="événements à venir" />
      </div>

      <div className="px-4 pt-4">
        <button
          onClick={() => setAjoutOuvert(true)}
          className="block w-full border-none text-white"
          style={{ borderRadius: 14, background: '#2D5A3D', padding: 14, fontSize: 14, fontWeight: 800, boxShadow: '0 6px 18px rgba(45,90,61,.25)' }}
        >
          Ajouter / importer un programme
        </button>
        <p className="mx-1 mt-2 mb-0 text-[11px] leading-snug text-texte-doux">
          L’import d’un programme par photo ou par dictée arrivera ici. Rien n’est
          publié sans votre validation.
        </p>
      </div>

      {/* Quatre entrées de programmation — filtres, pas décor */}
      <div className="pt-3.5">
        {([
          { id: 'affiche',       titre: "À l'affiche",     sous: `${compteurs.films} film${compteurs.films > 1 ? 's' : ''}` },
          { id: 'semaine',       titre: 'Cette semaine',   sous: `${compteurs.semaine} séance${compteurs.semaine > 1 ? 's' : ''}` },
          { id: 'prochainement', titre: 'Prochainement',   sous: `${Math.max(0, compteurs.total - compteurs.semaine)} séance${compteurs.total - compteurs.semaine > 1 ? 's' : ''}` },
        ] as const).map(e => {
          const actif = vue === e.id
          return (
            <button key={e.id} onClick={() => setVue(e.id)}
              className="flex w-full items-center gap-3 bg-white text-left"
              style={{ border: `1px solid ${actif ? '#C8DEC0' : '#F0EAE0'}`, background: actif ? '#F4FAF5' : '#fff', borderRadius: 14, padding: 12, margin: '0 16px 8px', width: 'calc(100% - 32px)' }}>
              <span className="flex flex-none items-center justify-center"
                style={{ width: 32, height: 32, borderRadius: 9, background: '#E8F2EB', color: '#2D5A3D' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.01em' }}>{e.titre}</div>
                <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>{e.sous}</div>
              </div>
            </button>
          )
        })}
        {/* Les événements spéciaux ne vivent pas ici : ce sont des événements
            du village, avec l'écran de publication existant. */}
        <a href={`/ajouter?etab=${data.cinema.id}`}
          className="flex items-center gap-3 bg-white no-underline"
          style={{ border: '1px solid #F0EAE0', borderRadius: 14, padding: 12, margin: '0 16px 8px', width: 'calc(100% - 32px)' }}>
          <span className="flex flex-none items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF0E5', color: '#C84B2F' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 8l2.5-4 4 2M9 6l4.5-2.5 4 2M15 4l4.5-1.5L21 6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-texte" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.01em' }}>Événements spéciaux</div>
            <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>Avant-première, ciné-débat — visibles aussi dans l’agenda du village</div>
          </div>
        </a>
      </div>

      {/* La programmation */}
      <div className="px-4 pt-4">
        <h2 className="m-0 mb-2 font-title text-[20px] leading-tight">Programmation</h2>
        {parJour.length === 0 ? (
          <Message titre="Aucune séance" texte="Ajoutez votre première séance pour qu’elle apparaisse sur La Place du Village." />
        ) : parJour.map(([date, liste]) => (
          <div key={date} className="mb-3">
            <div style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 700, color: '#1A1209', background: '#F7F1E6', borderBottom: '1px solid #F0EAE0', borderRadius: '12px 12px 0 0' }}>
              {jourLisible(date)}
            </div>
            <div style={{ border: '1px solid #F0EAE0', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#fff' }}>
              {liste.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3"
                  style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid #F0EAE0' }}>
                  <span className="flex-none font-title tabular-nums" style={{ fontSize: 14, width: 44 }}>{formatHeure(s.heure)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-texte" style={{ fontSize: 13, fontWeight: 700 }}>{films.get(s.film_id)?.titre ?? 'Film'}</div>
                    <div style={{ fontSize: 10.5, color: '#7A6A5A', marginTop: 2 }}>
                      {s.version.toUpperCase()}{s.salle ? ` · ${s.salle}` : ''}{s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => supprimer(s.id)}
                    aria-label="Supprimer la séance"
                    className="flex h-8 w-8 shrink-0 items-center justify-center border-none bg-transparent"
                    style={{ color: '#A99B89' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {ajoutOuvert && (
        <AjoutSeance
          cinemaId={data.cinema.id}
          films={data.films}
          onClose={() => setAjoutOuvert(false)}
          onAjoute={() => { setAjoutOuvert(false); void mutate() }}
        />
      )}
    </Coquille>
  )
}

/* ─── Ajout d'une séance ──────────────────────────────────────────────── */

/**
 * Le film est choisi dans ceux déjà saisis, ou créé à la volée. C'est ce qui
 * évite de recréer « Le Comte de Monte-Cristo » à chaque séance — le serveur
 * réutilise d'ailleurs tout film portant déjà ce titre.
 */
function AjoutSeance({ cinemaId, films, onClose, onAjoute }: {
  cinemaId: string
  films: Film[]
  onClose: () => void
  onAjoute: () => void
}) {
  const [filmId, setFilmId]   = useState<string>(films[0]?.id ?? 'nouveau')
  const [titre, setTitre]     = useState('')
  const [duree, setDuree]     = useState('')
  const [date, setDate]       = useState(dateParis())
  const [heure, setHeure]     = useState('20:30')
  const [version, setVersion] = useState<VersionFilm>('vf')
  const [salle, setSalle]     = useState('')
  const [busy, setBusy]       = useState(false)

  const nouveau = filmId === 'nouveau'

  async function enregistrer() {
    if (busy) return
    if (nouveau && !titre.trim()) { toast.error('Indiquez le titre du film.'); return }
    setBusy(true)
    try {
      let id = filmId
      if (nouveau) {
        const r = await authedFetch('/api/cinema/admin', {
          method: 'POST',
          body: JSON.stringify({ cinema: cinemaId, film: { titre: titre.trim(), duree_min: duree || null } }),
        })
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.film?.id) { toast.error(j?.error ?? 'Film non enregistré.'); setBusy(false); return }
        id = j.film.id
      }
      const r2 = await authedFetch('/api/cinema/admin', {
        method: 'POST',
        body: JSON.stringify({ cinema: cinemaId, seances: [{ film_id: id, date, heure, version, salle: salle || null }] }),
      })
      const j2 = await r2.json().catch(() => null)
      if (!r2.ok) { toast.error(j2?.error ?? 'Séance non enregistrée.'); setBusy(false); return }
      toast.success(j2?.crees ? 'Séance ajoutée.' : 'Cette séance existait déjà.')
      onAjoute()
    } finally { setBusy(false) }
  }

  return (
    <ClientPortal>
      <div onClick={onClose} className="fixed inset-0 z-[3400] flex items-end justify-center" style={{ background: 'rgba(26,18,9,0.5)' }}>
        <div onClick={e => e.stopPropagation()} className="w-full max-w-[460px] rounded-t-[22px] bg-white px-4 pb-8 pt-4">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: '#D1CCC4' }} />
          <p className="m-0 mb-3 text-center text-[15px] font-extrabold text-texte">Ajouter une séance</p>

          <Champ label="Film">
            <select value={filmId} onChange={e => setFilmId(e.target.value)} style={inputStyle}>
              {films.map(f => <option key={f.id} value={f.id}>{f.titre}</option>)}
              <option value="nouveau">+ Nouveau film…</option>
            </select>
          </Champ>

          {nouveau && (
            <>
              <Champ label="Titre du film">
                <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. Le Comte de Monte-Cristo" style={inputStyle} />
              </Champ>
              <Champ label="Durée (minutes)">
                <input value={duree} onChange={e => setDuree(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="120" style={inputStyle} />
              </Champ>
            </>
          )}

          <div className="flex gap-2">
            <div className="flex-1"><Champ label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Champ></div>
            <div className="flex-1"><Champ label="Heure"><input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={inputStyle} /></Champ></div>
          </div>

          <Champ label="Version">
            <div className="flex gap-1.5">
              {VERSIONS.map(v => (
                <button key={v.id} type="button" onClick={() => setVersion(v.id)}
                  className="flex-1 rounded-[10px] py-2.5 text-[12.5px] font-extrabold"
                  style={{
                    border: `1px solid ${version === v.id ? '#C8DEC0' : '#E8E0D4'}`,
                    background: version === v.id ? '#E8F2EB' : '#FDFAF5',
                    color: version === v.id ? '#2D5A3D' : '#1A1209',
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
          </Champ>

          <Champ label="Salle (facultatif)">
            <input value={salle} onChange={e => setSalle(e.target.value)} placeholder="Salle 1" style={inputStyle} />
          </Champ>

          <button onClick={enregistrer} disabled={busy}
            className="mt-2 w-full rounded-[14px] border-none py-[14px] text-[14px] font-extrabold text-white"
            style={{ background: '#2D5A3D', opacity: busy ? 0.6 : 1 }}>
            {busy ? '…' : 'Ajouter la séance'}
          </button>
        </div>
      </div>
    </ClientPortal>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #E8E0D4',
  background: '#FDFAF5', fontSize: 14, color: '#1A1209', fontFamily: 'var(--font-body), sans-serif',
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.05em] text-texte-doux">{label}</div>
      {children}
    </div>
  )
}

function Compteur({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-white" style={{ border: '1px solid #F0EAE0', borderRadius: 14, padding: 11 }}>
      <div className="font-title text-texte" style={{ fontSize: 24, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 10.5, color: '#7A6A5A', marginTop: 4, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="rounded-[14px] bg-white p-6 text-center" style={{ border: '1px solid #F0EAE0' }}>
      <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">{titre}</p>
      <p className="m-0 text-[12px] leading-snug text-texte-doux">{texte}</p>
    </div>
  )
}

function Coquille({ titre, sousTitre, onRetour, children }: {
  titre: string; sousTitre?: string; onRetour?: () => void; children: React.ReactNode
}) {
  return (
    <div className="relative min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      <div className="flex items-center gap-[11px] bg-white px-3.5 py-2.5"
        style={{ borderBottom: '1px solid #F0EAE0', paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
        {onRetour && (
          <button onClick={onRetour} aria-label="Retour"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white"
            style={{ border: '1px solid #E8E0D4' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-title text-[17px] leading-tight">{titre}</div>
          <div className="text-[11.5px] text-texte-doux">{sousTitre ?? 'Mon cinéma'}</div>
        </div>
      </div>
      <div className="px-4 pt-4">{!onRetour && null}</div>
      {children}
      <BottomNavBar />
    </div>
  )
}
