'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import DicteeModal from '@/components/DicteeModal'
import TimeWheelPicker from '@/components/TimeWheelPicker'
import RechercheFilm from '@/components/cinema/RechercheFilm'
import { compressToBase64 } from '@/lib/clientUpload'
import { VERSIONS, formatHeure, type Film, type VersionFilm } from '@/lib/cinema'

/**
 * « Le programme » — l'exploitant dicte sa semaine, l'écrit, ou la photographie.
 *
 *   « samedi prochain le Gondry à 17h30, puis Avatar 3 le dimanche à 14h »
 *
 * Claude fait la langue : il découpe, corrige l'orthographe de la dictée,
 * résout « samedi prochain » en date absolue, et rattache chaque film au
 * CATALOGUE du cinéma quand il y est déjà — « le Gondry » retrouve le film du
 * catalogue réalisé par Michel Gondry. Ce qu'il ne trouve pas, il ne l'invente
 * pas : la séance arrive marquée « film à ajouter », et l'exploitant passe par
 * la recherche de films, la même que partout ailleurs.
 *
 * Rien n'est enregistré sans un passage par cet écran de validation : les
 * séances arrivent cochées mais modifiables, jour, heure, version et film
 * compris. C'est là que se répare une erreur de compréhension, pas après coup
 * dans la programmation publiée.
 */

interface SeanceProposee {
  film_id: string | null
  recherche: string | null
  libelle: string
  date: string
  heure: string
  version: VersionFilm
  salle: string | null
  note: string | null
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

const champStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #E8E0D4',
  background: '#FDFAF5', fontSize: 14, color: '#1A1209', fontFamily: 'var(--font-body), sans-serif',
}
const boutonVert: React.CSSProperties = {
  borderRadius: 14, background: '#2D5A3D', padding: 14, fontSize: 14, fontWeight: 800,
}

function jourCourt(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function DicterProgramme({ cinemaId, films, onClose, onEnregistre }: {
  cinemaId: string
  films: Film[]
  onClose: () => void
  /** Le parent recharge : les films créés ici doivent entrer dans le catalogue. */
  onEnregistre: () => void
}) {
  const [etape, setEtape] = useState<'saisie' | 'seances'>('saisie')
  const [texte, setTexte] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState('image/jpeg')
  const [apercuPhoto, setApercuPhoto] = useState<string | null>(null)
  const [dicteeOuverte, setDicteeOuverte] = useState(false)
  const [busy, setBusy] = useState(false)

  const [seances, setSeances] = useState<SeanceProposee[]>([])
  /** Lignes ecartees a la validation — on le dit plutot que de les effacer. */
  const [ignorees, setIgnorees] = useState(0)
  const [coches, setCoches] = useState<Set<number>>(new Set())
  /** Catalogue local : il s'enrichit des films créés depuis cet écran. */
  const [catalogue, setCatalogue] = useState<Film[]>(films)
  /** Index de la séance dont on règle l'heure, et celle dont le film manque. */
  const [heureDe, setHeureDe] = useState<number | null>(null)
  const [chercheFilmDe, setChercheFilmDe] = useState<number | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galerieRef = useRef<HTMLInputElement>(null)

  const parId = useMemo(() => new Map(catalogue.map(f => [f.id, f])), [catalogue])
  const manquants = seances.filter(s => !s.film_id).length
  const prets = Array.from(coches).filter(i => seances[i]?.film_id).length

  async function choisirPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      // Un programme papier est du TEXTE : on compresse moins fort que pour une
      // affiche, sinon les horaires en petits caractères deviennent illisibles.
      const { base64, mimeType } = await compressToBase64(file, { maxDim: 1600, quality: 0.85 })
      setImage(base64)
      setImageMime(mimeType)
      setApercuPhoto(`data:${mimeType};base64,${base64}`)
    } catch {
      toast.error('Photo illisible.')
    }
  }

  async function lire(source?: string) {
    const brut = (source ?? texte).trim()
    if ((!brut && !image) || busy) return
    setBusy(true)
    const r = await authedFetch('/api/cinema/ia', {
      method: 'POST',
      body: JSON.stringify({
        cinema: cinemaId, mode: 'programme',
        texte: brut, image: image ?? undefined, imageMimeType: image ? imageMime : undefined,
      }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!r?.ok) { toast.error(j?.error ?? 'Lecture impossible.'); return }
    const lues: SeanceProposee[] = j?.seances ?? []
    if (!lues.length) { toast.error('Aucune séance comprise. Précisez les jours et les heures.'); return }
    setSeances(lues)
    setIgnorees(j?.ignorees ?? 0)
    // Tout est coché d'emblée : l'exploitant décoche ce qu'il ne veut pas,
    // plutôt que de recocher trente lignes qu'il vient de dicter.
    setCoches(new Set(lues.map((_, i) => i)))
    setEtape('seances')
  }

  function modifier(i: number, patch: Partial<SeanceProposee>) {
    setSeances(prev => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  }

  /** Un film créé depuis la recherche comble la séance qui l'attendait. */
  function filmAjoute(nouveaux: Film[]) {
    const i = chercheFilmDe
    setChercheFilmDe(null)
    if (!nouveaux.length) return
    setCatalogue(prev => {
      const connus = new Set(prev.map(f => f.id))
      return [...prev, ...nouveaux.filter(f => !connus.has(f.id))]
    })
    if (i == null) return
    const film = nouveaux[0]
    // Le même titre revient souvent plusieurs fois dans une semaine : on
    // comble toutes les séances qui l'attendaient, pas seulement celle-là.
    const attendu = seances[i]?.recherche?.toLowerCase() ?? null
    setSeances(prev => prev.map((s, k) => {
      if (s.film_id) return s
      const meme = k === i || (attendu && s.recherche?.toLowerCase() === attendu)
      return meme ? { ...s, film_id: film.id, recherche: null, libelle: film.titre } : s
    }))
  }

  async function enregistrer() {
    const retenues = Array.from(coches).sort((a, b) => a - b)
      .map(i => seances[i]).filter(s => s?.film_id)
    if (!retenues.length) { toast.error('Aucune séance prête à enregistrer.'); return }
    setBusy(true)
    const r = await authedFetch('/api/cinema/admin', {
      method: 'POST',
      body: JSON.stringify({
        cinema: cinemaId,
        seances: retenues.map(s => ({
          film_id: s.film_id, date: s.date, heure: s.heure,
          version: s.version, salle: s.salle, note: s.note,
        })),
      }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!r?.ok) { toast.error(j?.error ?? 'Enregistrement impossible.'); return }
    const crees = j?.crees ?? 0
    const doublons = (j?.recus ?? retenues.length) - crees
    toast.success(
      crees === 0 ? 'Ces séances étaient déjà programmées.'
        : `${crees} séance${crees > 1 ? 's' : ''} ajoutée${crees > 1 ? 's' : ''}${doublons > 0 ? `, ${doublons} déjà connue${doublons > 1 ? 's' : ''}` : ''}.`,
    )
    onEnregistre()
  }

  return (
    <ClientPortal>
      <div onClick={onClose} className="fixed inset-0 z-[3400] flex items-end justify-center" style={{ background: 'rgba(26,18,9,0.5)' }}>
        <div onClick={e => e.stopPropagation()} className="w-full max-w-[460px] rounded-t-[22px] bg-white px-4 pb-8 pt-4"
          style={{ maxHeight: '92dvh', overflowY: 'auto' }}>
          <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: '#D1CCC4' }} />

          {/* ─── La saisie ────────────────────────────────────────────── */}
          {etape === 'saisie' && (
            <>
              <p className="m-0 mb-1 text-center text-[15px] font-extrabold text-texte">Le programme</p>
              <p className="m-0 mb-3 text-center text-[11.5px] leading-snug text-texte-doux">
                Dictez, écrivez, ou photographiez votre programme. Rien n’est publié
                sans votre validation.
              </p>

              <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={4} autoFocus
                placeholder="« Samedi prochain le Gondry à 17h30 et 21h, puis Avatar 3 dimanche à 14h en VOST… »"
                style={{ ...champStyle, resize: 'none', lineHeight: 1.5 }} />

              {apercuPhoto && (
                <div className="relative mt-2 overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={apercuPhoto} alt="Programme" className="max-h-44 w-full object-cover" />
                  <button type="button" onClick={() => { setImage(null); setApercuPhoto(null) }}
                    aria-label="Retirer la photo"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-none text-white"
                    style={{ background: 'rgba(26,18,9,0.65)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <BoutonIcone label="Dicter" onClick={() => setDicteeOuverte(true)} disabled={busy}>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                </BoutonIcone>
                <BoutonIcone label="Photographier" onClick={() => cameraRef.current?.click()} disabled={busy}>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </BoutonIcone>
                <BoutonIcone label="Choisir une image" onClick={() => galerieRef.current?.click()} disabled={busy}>
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </BoutonIcone>
                <button type="button" onClick={() => void lire()} disabled={busy || (!texte.trim() && !image)}
                  className="flex-1 border-none text-white"
                  style={{ ...boutonVert, padding: 12, fontSize: 13.5, opacity: busy || (!texte.trim() && !image) ? 0.5 : 1 }}>
                  {busy ? 'Lecture…' : 'Lire le programme'}
                </button>
              </div>

              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={choisirPhoto} className="hidden" />
              <input ref={galerieRef} type="file" accept="image/*" onChange={choisirPhoto} className="hidden" />
            </>
          )}

          {/* ─── Les séances comprises ────────────────────────────────── */}
          {etape === 'seances' && (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="m-0 text-[15px] font-extrabold text-texte">
                  {seances.length} séance{seances.length > 1 ? 's' : ''} comprise{seances.length > 1 ? 's' : ''}
                </p>
                <button type="button"
                  onClick={() => setCoches(coches.size === seances.length ? new Set() : new Set(seances.map((_, i) => i)))}
                  className="shrink-0 border-none bg-transparent p-0 text-[11.5px] font-bold underline" style={{ color: '#2D5A3D' }}>
                  {coches.size === seances.length ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>

              {ignorees > 0 && (
                <p className="m-0 mb-2 text-[11px] leading-snug text-texte-doux">
                  {ignorees} ligne{ignorees > 1 ? 's' : ''} n’{ignorees > 1 ? 'ont' : 'a'} pas pu être
                  datée{ignorees > 1 ? 's' : ''} et {ignorees > 1 ? 'ont' : 'a'} été écartée{ignorees > 1 ? 's' : ''}.
                  Ajoutez-{ignorees > 1 ? 'les' : 'la'} à la main si besoin.
                </p>
              )}

              {manquants > 0 && (
                <div className="mb-2.5 rounded-xl px-3 py-2.5" style={{ background: '#FFF0E5', border: '1px solid #F5C8A8' }}>
                  <div className="text-[12px] font-extrabold" style={{ color: '#C84B2F' }}>
                    {manquants} séance{manquants > 1 ? 's' : ''} sans film dans votre catalogue
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-texte-doux">
                    Ajoutez le film avec le bouton de la ligne : la séance se remplira toute seule.
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {seances.map((s, i) => {
                  const on = coches.has(i)
                  const pret = !!s.film_id
                  return (
                    <div key={i}
                      style={{
                        border: `1px solid ${!pret ? '#F5C8A8' : on ? '#C8DEC0' : '#F0EAE0'}`,
                        background: !pret ? '#FFFAF6' : on ? '#F4FAF5' : '#FDFAF5',
                        borderRadius: 12, padding: 10,
                      }}>
                      <div className="flex items-start gap-2.5">
                        <button type="button"
                          onClick={() => setCoches(prev => {
                            const c = new Set(prev)
                            if (c.has(i)) c.delete(i); else c.add(i)
                            return c
                          })}
                          aria-label={on ? 'Retirer' : 'Retenir'}
                          className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border-2 bg-transparent p-0"
                          style={{ background: on ? '#2D5A3D' : 'transparent', borderColor: on ? '#2D5A3D' : '#E8E0D5' }}>
                          {on && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-extrabold text-texte">
                            {jourCourt(s.date)} · {formatHeure(s.heure)}
                          </div>
                          <div className="mt-0.5 truncate text-[12px]" style={{ color: pret ? '#1A1209' : '#C84B2F', fontWeight: pret ? 600 : 800 }}>
                            {pret ? (parId.get(s.film_id!)?.titre ?? s.libelle) : `${s.recherche ?? s.libelle} — film à ajouter`}
                          </div>
                          {(s.salle || s.note) && (
                            <div className="mt-0.5 text-[10.5px] text-texte-doux">
                              {[s.salle, s.note].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>

                        {!pret && (
                          <button type="button" onClick={() => setChercheFilmDe(i)}
                            className="flex-none border-none text-white"
                            style={{ background: '#C84B2F', borderRadius: 10, padding: '7px 10px', fontSize: 11.5, fontWeight: 800 }}>
                            Ajouter
                          </button>
                        )}
                      </div>

                      {/* Réglages de la ligne — c'est ici qu'on rattrape une
                          mauvaise compréhension, avant l'enregistrement. */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[30px]">
                        <input type="date" value={s.date} onChange={e => modifier(i, { date: e.target.value })}
                          style={{ ...petitChamp, width: 132 }} />
                        <button type="button" onClick={() => setHeureDe(i)} style={{ ...petitChamp, width: 66, textAlign: 'left', cursor: 'pointer' }}>
                          {s.heure}
                        </button>
                        <select value={s.version} onChange={e => modifier(i, { version: e.target.value as VersionFilm })}
                          style={{ ...petitChamp, width: 72 }}>
                          {VERSIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                        <select value={s.film_id ?? ''} onChange={e => modifier(i, { film_id: e.target.value || null })}
                          style={{ ...petitChamp, flex: 1, minWidth: 110 }}>
                          <option value="">— film à choisir —</option>
                          {catalogue.map(f => <option key={f.id} value={f.id}>{f.titre}</option>)}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>

              <button onClick={enregistrer} disabled={busy || !prets}
                className="mt-3 w-full border-none text-white" style={{ ...boutonVert, opacity: busy || !prets ? 0.5 : 1 }}>
                {busy ? '…' : prets ? `Enregistrer ${prets} séance${prets > 1 ? 's' : ''}` : 'Aucune séance prête'}
              </button>
              <button onClick={() => setEtape('saisie')}
                className="mt-2 w-full border-none bg-transparent py-2.5 text-[13px] font-bold text-texte-doux">
                Recommencer
              </button>
            </>
          )}
        </div>
      </div>

      <TimeWheelPicker
        open={heureDe !== null}
        value={heureDe !== null ? seances[heureDe]?.heure ?? '20:30' : '20:30'}
        zIndex={3500}
        onClose={() => setHeureDe(null)}
        onConfirm={hhmm => { if (heureDe !== null) modifier(heureDe, { heure: hhmm }); setHeureDe(null) }}
      />

      {dicteeOuverte && (
        <DicteeModal
          titre="Dicter le programme"
          zIndex={3500}
          onClose={() => setDicteeOuverte(false)}
          onTranscript={t => { setDicteeOuverte(false); setTexte(t); void lire(t) }}
        />
      )}

      {chercheFilmDe !== null && (
        <RechercheFilm
          cinemaId={cinemaId}
          requeteInitiale={seances[chercheFilmDe]?.recherche ?? ''}
          onClose={() => setChercheFilmDe(null)}
          onCrees={filmAjoute}
        />
      )}
    </ClientPortal>
  )
}

const petitChamp: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 8, border: '1px solid #E8E0D4',
  background: '#fff', fontSize: 11.5, color: '#1A1209',
  fontFamily: 'var(--font-body), sans-serif',
}

function BoutonIcone({ label, onClick, disabled, children }: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="flex h-11 w-11 flex-none items-center justify-center border bg-white"
      style={{ borderColor: '#E8E0D4', borderRadius: 12, color: '#C84B2F', opacity: disabled ? 0.5 : 1 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}
