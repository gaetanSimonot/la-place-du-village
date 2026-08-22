'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import type { Film } from '@/lib/cinema'

/**
 * « Ajouter un film » : on cherche, on choisit, on vérifie, on crée.
 *
 * La recherche interroge TMDB **côté serveur** — le jeton ne quitte jamais le
 * serveur, et l'écran ne reçoit que les champs que notre fiche utilise.
 *
 * Un aperçu s'intercale avant la création. C'est lui qui crée la confiance
 * dans l'import : on ne l'escamote pas.
 *
 * TMDB ne doit jamais bloquer. Indisponible, sans résultat, ou résultats
 * mauvais : la création manuelle reste accessible en permanence, pas
 * seulement en cas d'échec.
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

/** Vignette d'affiche, avec le fond dégradé du design system cinéma. */
function Vignette({ url, largeur }: { url: string | null; largeur: number }) {
  return (
    <div className="relative flex-none overflow-hidden"
      style={{ width: largeur, aspectRatio: '2 / 3', borderRadius: largeur > 60 ? 10 : 7, background: 'linear-gradient(160deg,#2A2320,#0F0D0C)' }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
    </div>
  )
}

export default function RechercheFilm({ cinemaId, onClose, onCree }: {
  cinemaId: string
  onClose: () => void
  onCree: (film: Film) => void
}) {
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState<TmdbResultat[] | null>(null)
  const [cherche, setCherche] = useState(false)
  const [indisponible, setIndisponible] = useState(false)
  const [apercu, setApercu] = useState<TmdbDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [manuel, setManuel] = useState(false)
  const [titreManuel, setTitreManuel] = useState('')

  // Anti-rebond : sans lui, chaque frappe partirait au serveur. Deux
  // caractères minimum — « a » ne veut rien dire pour une recherche de film.
  useEffect(() => {
    const terme = q.trim()
    if (terme.length < 2) { setResultats(null); return }
    const t = setTimeout(async () => {
      setCherche(true)
      const r = await authedFetch(`/api/cinema/tmdb?cinema=${cinemaId}&q=${encodeURIComponent(terme)}`).catch(() => null)
      setCherche(false)
      if (!r) { setIndisponible(true); setResultats([]); return }
      const j = await r.json().catch(() => null)
      if (!r.ok) { setIndisponible(!!j?.indisponible); setResultats([]); return }
      setIndisponible(false)
      setResultats(j?.resultats ?? [])
    }, 350)
    return () => clearTimeout(t)
  }, [q, cinemaId])

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
  }

  async function creerDepuisTmdb() {
    if (!apercu || busy) return
    setBusy(true)
    const r = await authedFetch('/api/cinema/tmdb', {
      method: 'POST',
      body: JSON.stringify({ cinema: cinemaId, tmdbId: apercu.tmdbId }),
    }).catch(() => null)
    const j = r && r.ok ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!j?.film) { toast.error('Création impossible.'); return }
    toast.success(j.reutilise ? 'Ce film existait déjà, il est réutilisé.' : 'Film créé.')
    onCree(j.film as Film)
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
    onCree(j.film as Film)
  }

  return (
    <ClientPortal>
      <div onClick={onClose} className="fixed inset-0 z-[3400] flex items-end justify-center" style={{ background: 'rgba(26,18,9,0.5)' }}>
        <div onClick={e => e.stopPropagation()} className="w-full max-w-[460px] rounded-t-[22px] bg-white px-4 pb-8 pt-4"
          style={{ maxHeight: '92dvh', overflowY: 'auto' }}>
          <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: '#D1CCC4' }} />

          {apercu ? (
            <>
              <p className="m-0 mb-3 text-center text-[15px] font-extrabold text-texte">Créer ce film ?</p>
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
              <button onClick={creerDepuisTmdb} disabled={busy}
                className="mt-4 w-full border-none text-white"
                style={{ borderRadius: 14, background: '#2D5A3D', padding: 14, fontSize: 14, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
                {busy ? '…' : 'Créer le film'}
              </button>
              <button onClick={() => setApercu(null)}
                className="mt-2 w-full border-none bg-transparent py-2.5 text-[13px] font-bold text-texte-doux">
                Choisir un autre film
              </button>
            </>
          ) : (
            <>
              <p className="m-0 mb-3 text-center text-[15px] font-extrabold text-texte">Ajouter un film</p>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un film…" autoFocus style={champStyle} />

              {indisponible && (
                <p className="mb-0 mt-2 text-[11.5px] leading-snug" style={{ color: '#B53A22' }}>
                  Recherche automatique indisponible. Vous pouvez créer le film à la main.
                </p>
              )}
              {cherche && <p className="mb-0 mt-3 text-center text-[12px] text-texte-doux">Recherche…</p>}

              {resultats && resultats.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {resultats.map(r => (
                    <button key={r.tmdbId} onClick={() => ouvrirApercu(r)} disabled={busy}
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

              {resultats && resultats.length === 0 && !cherche && !indisponible && (
                <p className="mb-0 mt-3 text-center text-[12px] text-texte-doux">Aucun résultat.</p>
              )}

              {/* Repli manuel — accessible en permanence, pas seulement après un échec */}
              <div className="mt-4 pt-3" style={{ borderTop: '1px dashed #E8E0D4' }}>
                {manuel ? (
                  <>
                    <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.05em] text-texte-doux">Titre du film</div>
                    <input value={titreManuel} onChange={e => setTitreManuel(e.target.value)}
                      placeholder={q || 'Titre'} style={{ ...champStyle, marginBottom: 10 }} />
                    <button onClick={creerManuel} disabled={busy}
                      className="w-full border-none text-white"
                      style={{ borderRadius: 12, background: '#2D5A3D', padding: 12, fontSize: 13.5, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
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
    </ClientPortal>
  )
}
