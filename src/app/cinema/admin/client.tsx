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
    const m = new Map<string, SeanceAdmin[]>()
    for (const s of seances.filter(x => x.date >= aujourdhui)) {
      const l = m.get(s.date) ?? []; l.push(s); m.set(s.date, l)
    }
    return Array.from(m.entries())
  }, [seances, aujourdhui])

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
      <div className="flex gap-2 px-4 pt-4">
        <Compteur n={compteurs.films}   label="films à l’affiche" />
        <Compteur n={compteurs.semaine} label="séances cette semaine" />
        <Compteur n={compteurs.total}   label="séances à venir" />
      </div>

      <div className="px-4 pt-4">
        <button
          onClick={() => setAjoutOuvert(true)}
          className="w-full rounded-[14px] border-none py-[15px] text-[14.5px] font-extrabold text-white"
          style={{ background: '#C84B2F' }}
        >
          + Ajouter une séance
        </button>
        <p className="mx-1 mt-2 mb-0 text-[11px] leading-snug text-texte-doux">
          L’import d’un programme par photo ou par dictée arrivera ici. Rien n’est
          publié sans votre validation.
        </p>
      </div>

      {/* La programmation */}
      <div className="px-4 pt-5">
        <h2 className="m-0 mb-2 font-title text-[20px] leading-tight">Programmation</h2>
        {parJour.length === 0 ? (
          <Message titre="Aucune séance" texte="Ajoutez votre première séance pour qu’elle apparaisse sur La Place du Village." />
        ) : parJour.map(([date, liste]) => (
          <div key={date} className="mb-3">
            <div className="rounded-t-[12px] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.05em]"
              style={{ background: '#F7F1E6', color: '#7A6A5A' }}>
              {jourLisible(date)}
            </div>
            <div style={{ border: '1px solid #F0EAE0', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#fff' }}>
              {liste.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #F7F1E6' }}>
                  <span className="w-[46px] shrink-0 font-title text-[15px] tabular-nums">{formatHeure(s.heure)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-texte">{films.get(s.film_id)?.titre ?? 'Film'}</div>
                    <div className="text-[11px] text-texte-doux">
                      {s.version.toUpperCase()}{s.salle ? ` · ${s.salle}` : ''}{s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => supprimer(s.id)}
                    aria-label="Supprimer la séance"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none"
                    style={{ background: '#FFF0E5', color: '#C84B2F' }}
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
    <div className="flex-1 rounded-[12px] bg-white px-2 py-3 text-center" style={{ border: '1px solid #F0EAE0' }}>
      <div className="font-title text-[22px] leading-none text-texte">{n}</div>
      <div className="mt-1 text-[10px] font-bold leading-tight text-texte-doux">{label}</div>
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
