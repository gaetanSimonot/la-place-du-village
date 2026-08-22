'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import DicteeModal from '@/components/DicteeModal'
import type { Film } from '@/lib/cinema'

/**
 * « Ajouter des films » — une seule porte, trois façons d'y entrer.
 *
 *   1. le champ de recherche, qui trouve des films ET des personnes : taper
 *      « Will Smith » propose sa filmographie, là où une recherche de titre
 *      ne rendrait rien ;
 *   2. la dictée ou le texte libre, pour plusieurs films d'un coup — « le
 *      dernier Lilo & Stitch, les films de Michel Gondry ». C'est Claude qui
 *      découpe la phrase et corrige l'orthographe de la dictée, puis TMDB qui
 *      trouve. Claude ne propose jamais un film lui-même ;
 *   3. la saisie manuelle, accessible en permanence et pas seulement après un
 *      échec.
 *
 * Les trois débouchent sur la même liste d'affiches à cocher, comme la
 * sélection multi-événements de /ajouter. Une demande précise arrive cochée,
 * une filmographie entière arrive décochée : sinon « les films de George
 * Lucas » en créerait douze d'un coup.
 *
 * TMDB ne doit jamais bloquer : indisponible, la saisie manuelle reste.
 */

interface TmdbResultat {
  tmdbId: number
  titre: string
  titreOriginal: string | null
  annee: number | null
  afficheUrl: string | null
  synopsis: string | null
}
interface TmdbDetails extends TmdbResultat {
  dureeMin: number | null
  genres: string[]
  realisateur: string | null
  casting: string | null
  bandeAnnonceUrl: string | null
  avertissement: string | null
}
interface Personne {
  personneId: number
  nom: string
  role: 'realisateur' | 'acteur'
  portraitUrl: string | null
  connuPour: string
}
interface Candidat extends TmdbResultat { dejaLa: boolean }
interface Groupe {
  libelle: string
  precis: boolean
  films: Candidat[]
  vide?: string
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

/** Vignette d'affiche, avec le fond dégradé du design system cinéma. */
function Vignette({ url, largeur, rond }: { url: string | null; largeur: number; rond?: boolean }) {
  return (
    <div className="relative flex-none overflow-hidden"
      style={{
        width: largeur, aspectRatio: rond ? '1 / 1' : '2 / 3',
        borderRadius: rond ? largeur / 2 : largeur > 60 ? 10 : 7,
        background: 'linear-gradient(160deg,#2A2320,#0F0D0C)',
      }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
    </div>
  )
}

type Etape = 'saisie' | 'candidats' | 'apercu'

export default function RechercheFilm({ cinemaId, requeteInitiale, onClose, onCrees }: {
  cinemaId: string
  /** Titre pré-rempli — le programme s'en sert pour rattraper un film manquant. */
  requeteInitiale?: string
  onClose: () => void
  onCrees: (films: Film[]) => void
}) {
  const [etape, setEtape] = useState<Etape>('saisie')

  // ── Recherche instantanée ────────────────────────────────────────────
  const [q, setQ] = useState(requeteInitiale ?? '')
  const [resultats, setResultats] = useState<TmdbResultat[] | null>(null)
  const [personnes, setPersonnes] = useState<Personne[]>([])
  const [cherche, setCherche] = useState(false)
  const [indisponible, setIndisponible] = useState(false)

  // ── Dictée / texte libre ─────────────────────────────────────────────
  const [texte, setTexte] = useState('')
  const [dicteeOuverte, setDicteeOuverte] = useState(false)

  // ── Sélection ────────────────────────────────────────────────────────
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [coches, setCoches] = useState<Set<number>>(new Set())

  const [apercu, setApercu] = useState<TmdbDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [manuel, setManuel] = useState(false)
  const [titreManuel, setTitreManuel] = useState('')

  // Anti-rebond : sans lui, chaque frappe partirait au serveur. Deux
  // caractères minimum — « a » ne veut rien dire pour une recherche de film.
  useEffect(() => {
    const terme = q.trim()
    if (terme.length < 2) { setResultats(null); setPersonnes([]); return }
    const t = setTimeout(async () => {
      setCherche(true)
      const r = await authedFetch(`/api/cinema/tmdb?cinema=${cinemaId}&q=${encodeURIComponent(terme)}`).catch(() => null)
      setCherche(false)
      if (!r) { setIndisponible(true); setResultats([]); setPersonnes([]); return }
      const j = await r.json().catch(() => null)
      if (!r.ok) { setIndisponible(!!j?.indisponible); setResultats([]); setPersonnes([]); return }
      setIndisponible(false)
      setResultats(j?.resultats ?? [])
      setPersonnes(j?.personnes ?? [])
    }, 350)
    return () => clearTimeout(t)
  }, [q, cinemaId])

  /** Ouvre la liste à cocher. Les groupes « précis » arrivent cochés. */
  function ouvrirCandidats(g: Groupe[]) {
    setGroupes(g)
    const depart = new Set<number>()
    for (const grp of g) {
      if (!grp.precis) continue
      for (const f of grp.films) if (!f.dejaLa) depart.add(f.tmdbId)
    }
    setCoches(depart)
    setEtape('candidats')
  }

  /** La filmographie d'une personne, depuis le champ de recherche. */
  async function ouvrirPersonne(p: Personne) {
    setBusy(true)
    const r = await authedFetch(`/api/cinema/tmdb?cinema=${cinemaId}&personne=${p.personneId}&role=${p.role}`).catch(() => null)
    const j = r && r.ok ? await r.json().catch(() => null) : null
    setBusy(false)
    const films: Candidat[] = (j?.resultats ?? []).map((f: TmdbResultat) => ({ ...f, dejaLa: false }))
    if (!films.length) { toast.error('Aucun film trouvé pour cette personne.'); return }
    ouvrirCandidats([{
      libelle: `${p.role === 'realisateur' ? 'Les films de' : 'Les films avec'} ${p.nom}`,
      precis: false,
      films,
    }])
  }

  /** La dictée ou le texte libre → Claude découpe, TMDB trouve. */
  async function lancerIA(source?: string) {
    const brut = (source ?? texte).trim()
    if (!brut || busy) return
    setBusy(true)
    const r = await authedFetch('/api/cinema/ia', {
      method: 'POST',
      body: JSON.stringify({ cinema: cinemaId, mode: 'films', texte: brut }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!r?.ok) { toast.error(j?.error ?? 'Recherche impossible.'); return }
    const g: Groupe[] = j?.groupes ?? []
    if (!g.length || g.every(x => !x.films.length)) {
      toast.error('Aucun film trouvé. Précisez le titre ou le nom.')
      if (g.length) ouvrirCandidats(g)
      return
    }
    ouvrirCandidats(g)
  }

  async function ouvrirApercu(r: TmdbResultat) {
    setBusy(true)
    const res = await authedFetch(`/api/cinema/tmdb?cinema=${cinemaId}&tmdb=${r.tmdbId}`).catch(() => null)
    setBusy(false)
    const j = res && res.ok ? await res.json().catch(() => null) : null
    // Détail indisponible : on montre quand même ce que la recherche a donné,
    // plutôt que de renvoyer l'exploitant à la case départ.
    setApercu(j?.film ?? {
      ...r, dureeMin: null, genres: [], realisateur: null,
      casting: null, bandeAnnonceUrl: null, avertissement: null,
    })
    setEtape('apercu')
  }

  /** Création — un film depuis l'aperçu, ou toute la sélection cochée. */
  async function creer(ids: number[]) {
    if (!ids.length || busy) return
    setBusy(true)
    const r = await authedFetch('/api/cinema/tmdb', {
      method: 'POST',
      body: JSON.stringify({ cinema: cinemaId, tmdbIds: ids }),
    }).catch(() => null)
    const j = r && r.ok ? await r.json().catch(() => null) : null
    setBusy(false)
    const films: Film[] = j?.films ?? (j?.film ? [j.film] : [])
    if (!films.length) { toast.error(j?.error ?? 'Création impossible.'); return }
    const crees = j?.crees ?? films.length
    toast.success(
      // « Déjà là » se disait sans dire OÙ : la fiche est partagée entre les
      // salles, mais elle rejoint bien le catalogue de celle-ci.
      crees === 0 ? 'Ces films existaient déjà — ils rejoignent vos films.'
        : films.length === 1 ? (j?.reutilise ? 'Ce film existait déjà — il rejoint vos films.' : 'Film créé.')
        : `${crees} film${crees > 1 ? 's' : ''} ajouté${crees > 1 ? 's' : ''}.`,
    )
    onCrees(films)
  }

  async function creerManuel() {
    const titre = (titreManuel.trim() || q.trim())
    if (!titre) { toast.error('Indiquez un titre.'); return }
    setBusy(true)
    const r = await authedFetch('/api/cinema/admin', {
      method: 'POST',
      body: JSON.stringify({ cinema: cinemaId, film: { titre } }),
    }).catch(() => null)
    const j = r && r.ok ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!j?.film) { toast.error('Création impossible.'); return }
    toast.success('Film créé — complétez sa fiche.')
    onCrees([j.film as Film])
  }

  const totalCoches = coches.size

  return (
    <ClientPortal>
      <div onClick={onClose} className="fixed inset-0 z-[3400] flex items-end justify-center" style={{ background: 'rgba(26,18,9,0.5)' }}>
        <div onClick={e => e.stopPropagation()} className="w-full max-w-[460px] rounded-t-[22px] bg-white px-4 pb-8 pt-4"
          style={{ maxHeight: '92dvh', overflowY: 'auto' }}>
          <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: '#D1CCC4' }} />

          {/* ─── Aperçu d'un film ─────────────────────────────────────── */}
          {etape === 'apercu' && apercu && (
            <>
              <p className="m-0 mb-3 text-center text-[15px] font-extrabold text-texte">Ajouter ce film ?</p>
              <div className="flex gap-3.5">
                <Vignette url={apercu.afficheUrl} largeur={104} />
                <div className="min-w-0 flex-1">
                  <div className="font-title text-texte" style={{ fontSize: 18, lineHeight: 1.15 }}>{apercu.titre}</div>
                  {apercu.titreOriginal && <div className="mt-0.5 text-[11.5px] italic text-texte-doux">{apercu.titreOriginal}</div>}
                  <div style={{ marginTop: 8, fontSize: 12, color: '#7A6A5A', lineHeight: 1.6 }}>
                    {[apercu.dureeMin ? `${apercu.dureeMin} min` : null, apercu.annee, apercu.genres.join(', ') || null]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {apercu.realisateur && (
                    <div className="mt-1 text-[12px] text-texte"><span className="text-texte-doux">De </span>{apercu.realisateur}</div>
                  )}
                  {apercu.avertissement && (
                    <div className="mt-2 inline-block rounded-[6px] px-2 py-1 text-[10.5px] font-extrabold"
                      style={{ background: '#FFF0E5', color: '#C84B2F' }}>{apercu.avertissement}</div>
                  )}
                  {apercu.bandeAnnonceUrl && (
                    <div className="mt-1.5 text-[11px] font-bold" style={{ color: '#2D5A3D' }}>Bande-annonce trouvée</div>
                  )}
                </div>
              </div>
              {apercu.synopsis && (
                <p className="mt-3 line-clamp-5 text-texte" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{apercu.synopsis}</p>
              )}
              <button onClick={() => creer([apercu.tmdbId])} disabled={busy}
                className="mt-4 w-full border-none text-white" style={{ ...boutonVert, opacity: busy ? 0.6 : 1 }}>
                {busy ? '…' : 'Ajouter le film'}
              </button>
              <button onClick={() => { setApercu(null); setEtape(groupes.length ? 'candidats' : 'saisie') }}
                className="mt-2 w-full border-none bg-transparent py-2.5 text-[13px] font-bold text-texte-doux">
                Retour
              </button>
            </>
          )}

          {/* ─── La sélection à cocher ────────────────────────────────── */}
          {etape === 'candidats' && (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="m-0 text-[15px] font-extrabold text-texte">Films proposés</p>
                <button type="button"
                  onClick={() => {
                    const tous = groupes.flatMap(g => g.films.filter(f => !f.dejaLa).map(f => f.tmdbId))
                    setCoches(totalCoches === tous.length ? new Set() : new Set(tous))
                  }}
                  className="shrink-0 border-none bg-transparent p-0 text-[11.5px] font-bold underline" style={{ color: '#2D5A3D' }}>
                  {totalCoches > 0 ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>

              {groupes.map((g, gi) => (
                <div key={gi} className="mb-3">
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-texte-doux">
                    {g.libelle}
                  </div>
                  {g.vide && <p className="m-0 text-[12px]" style={{ color: '#B53A22' }}>{g.vide}</p>}
                  <div className="flex flex-col gap-1.5">
                    {g.films.map(f => {
                      const on = coches.has(f.tmdbId)
                      return (
                        <div key={f.tmdbId}
                          onClick={() => {
                            if (f.dejaLa) return
                            setCoches(prev => {
                              const s = new Set(prev)
                              if (s.has(f.tmdbId)) s.delete(f.tmdbId); else s.add(f.tmdbId)
                              return s
                            })
                          }}
                          className="flex items-center gap-2.5"
                          style={{
                            border: `1px solid ${on ? '#C8DEC0' : '#F0EAE0'}`,
                            background: on ? '#F4FAF5' : '#FDFAF5',
                            borderRadius: 12, padding: 8,
                            opacity: f.dejaLa ? 0.55 : 1,
                            cursor: f.dejaLa ? 'default' : 'pointer',
                          }}>
                          <div className="flex h-5 w-5 flex-none items-center justify-center rounded border-2"
                            style={{ background: on ? '#2D5A3D' : 'transparent', borderColor: on ? '#2D5A3D' : '#E8E0D5' }}>
                            {on && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <Vignette url={f.afficheUrl} largeur={38} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-texte" style={{ fontSize: 13.5, fontWeight: 700 }}>{f.titre}</div>
                            <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                              {f.dejaLa ? 'Déjà dans votre catalogue' : [f.annee, f.titreOriginal].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </div>
                          <button type="button" onClick={e => { e.stopPropagation(); void ouvrirApercu(f) }}
                            aria-label="Voir la fiche"
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border bg-white"
                            style={{ borderColor: '#E8E0D4', color: '#7A6A5A' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button onClick={() => creer(Array.from(coches))} disabled={busy || !totalCoches}
                className="mt-1 w-full border-none text-white"
                style={{ ...boutonVert, opacity: busy || !totalCoches ? 0.5 : 1 }}>
                {busy ? '…' : totalCoches ? `Ajouter ${totalCoches} film${totalCoches > 1 ? 's' : ''}` : 'Cochez un film'}
              </button>
              <button onClick={() => setEtape('saisie')}
                className="mt-2 w-full border-none bg-transparent py-2.5 text-[13px] font-bold text-texte-doux">
                Chercher autre chose
              </button>
            </>
          )}

          {/* ─── La saisie ────────────────────────────────────────────── */}
          {etape === 'saisie' && (
            <>
              <p className="m-0 mb-3 text-center text-[15px] font-extrabold text-texte">Ajouter des films</p>

              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Un titre, un réalisateur, un acteur…" autoFocus style={champStyle} />

              {indisponible && (
                <p className="mb-0 mt-2 text-[11.5px] leading-snug" style={{ color: '#B53A22' }}>
                  Recherche automatique indisponible. Vous pouvez créer le film à la main.
                </p>
              )}
              {cherche && <p className="mb-0 mt-3 text-center text-[12px] text-texte-doux">Recherche…</p>}

              {/* Les personnes d'abord : taper « Will Smith » cherche un titre
                  qui n'existe pas, et c'est sa filmographie qu'on veut. */}
              {personnes.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {personnes.map(p => (
                    <button key={p.personneId} onClick={() => void ouvrirPersonne(p)} disabled={busy}
                      className="flex items-center gap-3 text-left"
                      style={{ border: '1px solid #E9DFF0', background: '#FBF7FD', borderRadius: 12, padding: 8 }}>
                      <Vignette url={p.portraitUrl} largeur={38} rond />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-texte" style={{ fontSize: 13.5, fontWeight: 700 }}>
                          {p.role === 'realisateur' ? 'Les films de' : 'Les films avec'} {p.nom}
                        </div>
                        <div className="truncate" style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                          {p.connuPour || (p.role === 'realisateur' ? 'Réalisation' : 'Interprétation')}
                        </div>
                      </div>
                      <span className="flex-none pr-1" style={{ color: '#7A6A5A' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {resultats && resultats.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {resultats.map(r => (
                    <button key={r.tmdbId} onClick={() => void ouvrirApercu(r)} disabled={busy}
                      className="flex items-center gap-3 text-left"
                      style={{ border: '1px solid #F0EAE0', background: '#FDFAF5', borderRadius: 12, padding: 8 }}>
                      <Vignette url={r.afficheUrl} largeur={42} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-texte" style={{ fontSize: 13.5, fontWeight: 700 }}>{r.titre}</div>
                        <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                          {[r.annee, r.titreOriginal].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {resultats && resultats.length === 0 && !personnes.length && !cherche && !indisponible && (
                <p className="mb-0 mt-3 text-center text-[12px] text-texte-doux">Aucun résultat.</p>
              )}

              {/* Plusieurs films d'un coup, dictés ou écrits */}
              <div className="mt-4 pt-3" style={{ borderTop: '1px dashed #E8E0D4' }}>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-texte-doux">
                  Ou dictez plusieurs films
                </div>
                <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={2}
                  placeholder="« le dernier Lilo & Stitch, les films de Michel Gondry… »"
                  style={{ ...champStyle, resize: 'none', lineHeight: 1.45 }} />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setDicteeOuverte(true)} disabled={busy}
                    aria-label="Dicter"
                    className="flex h-11 w-11 flex-none items-center justify-center border bg-white"
                    style={{ borderColor: '#E8E0D4', borderRadius: 12, color: '#C84B2F' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => void lancerIA()} disabled={busy || !texte.trim()}
                    className="flex-1 border-none text-white"
                    style={{ ...boutonVert, padding: 12, fontSize: 13.5, opacity: busy || !texte.trim() ? 0.5 : 1 }}>
                    {busy ? '…' : 'Chercher ces films'}
                  </button>
                </div>
              </div>

              {/* Repli manuel — accessible en permanence, pas seulement après un échec */}
              <div className="mt-4 pt-3" style={{ borderTop: '1px dashed #E8E0D4' }}>
                {manuel ? (
                  <>
                    <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.05em] text-texte-doux">Titre du film</div>
                    <input value={titreManuel} onChange={e => setTitreManuel(e.target.value)}
                      placeholder={q || 'Titre'} style={{ ...champStyle, marginBottom: 10 }} />
                    <button onClick={creerManuel} disabled={busy}
                      className="w-full border-none text-white"
                      style={{ ...boutonVert, borderRadius: 12, padding: 12, fontSize: 13.5, opacity: busy ? 0.6 : 1 }}>
                      Créer et compléter à la main
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setManuel(true); setTitreManuel(q) }}
                    className="w-full border-none bg-transparent py-1 text-[12.5px] font-bold" style={{ color: '#2D5A3D' }}>
                    Créer le film manuellement
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {dicteeOuverte && (
        <DicteeModal
          titre="Dicter des films"
          zIndex={3500}
          onClose={() => setDicteeOuverte(false)}
          onTranscript={t => {
            setDicteeOuverte(false)
            setTexte(t)
            // La dictée enchaîne d'elle-même : on parle, la liste apparaît.
            void lancerIA(t)
          }}
        />
      )}
    </ClientPortal>
  )
}
