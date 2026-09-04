'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Mode « Transport » : ou je pars, ou je vais, quand.
 *
 * LA RECHERCHE SE DEGROSSIT, elle ne s'impose pas. On commence par deux
 * VILLES — personne ne pense « GANGES - MAIRIE », on pense « je vais de
 * Ganges a Montpellier ». On obtient deja tous les bus, avec l'arret que
 * chacun emprunte. Puis, si on veut, on designe un arret precis sur la carte
 * et la liste se resserre sur lui. Rien n'est obligatoire : a chaque etape on
 * a des horaires, ils deviennent seulement plus precis.
 *
 * Et quand on choisit un bus, on lit TOUS les arrets qu'il dessert avec leur
 * heure de passage. C'est la vraie reponse a « ou et quand je monte » — mieux
 * que de faire choisir un arret a l'aveugle avant de connaitre les horaires.
 *
 * La 608 compte 98 arrets pour 15 communes ; Ganges en a 4, desservis par le
 * meme bus a deux minutes d'intervalle. D'ou ce choix : la commune d'abord.
 */

export interface ArretChoisissable { stop_id: string; nom: string }

interface Trajet {
  trip_id: string
  depart: string
  arrivee: string
  duree_min: number
  arrets_intermediaires: number
  destination: string | null
  arret_depart: string
  arret_arrivee: string
}

interface ArretDesservi {
  stop_id: string
  nom: string
  heure: string | null
}

/** « GANGES - MAIRIE » → « Ganges — Mairie ». */
export function nomLisible(brut: string): string {
  // On coupe sur « espace tiret espace », le separateur du GTFS — PAS sur les
  // tirets internes, sinon « SAINT-BAUZILLE-DE-PUTOIS » devient
  // « Saint — Bauzille — De — Putois ».
  return brut
    .split(' - ')
    .map(p => p.trim().toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, s, c) => s + c.toUpperCase()))
    .join(' — ')
}

/** La commune d'un arret : ce qui precede le premier tiret. */
export function communeDe(nom: string): string {
  return nom.split(' - ')[0].trim()
}

/** Le lieu seul, sans la commune. */
function lieuDe(nom: string): string {
  const bouts = nom.split(' - ')
  return bouts.length > 1 ? nomLisible(bouts.slice(1).join(' - ')) : nomLisible(nom)
}

/** Sans accents ni casse — pour que « gely » trouve « GÉLY ». */
function sansAccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function heureParis(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace('h', ':')
}

const CHAMP: React.CSSProperties = {
  width: '100%', height: 42, borderRadius: 11, border: '1px solid #E8E0D4',
  background: '#fff', padding: '0 12px', fontSize: 14, color: '#1A1209',
  fontFamily: 'var(--font-body), sans-serif',
}
const ETIQUETTE: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em',
  textTransform: 'uppercase', color: '#7A6A5A', marginBottom: 4,
}

/** Un champ de ville a suggestions. */
function ChampCommune({
  etiquette, valeur, precis, communes, onChoisir, onEffacerPrecis, couleur,
}: {
  etiquette: string
  valeur: string
  /** L'arrêt exact, si l'utilisateur en a désigné un sur la carte. */
  precis: string | null
  communes: string[]
  onChoisir: (c: string) => void
  onEffacerPrecis: () => void
  couleur: string
}) {
  const [saisie, setSaisie] = useState('')
  const [ouvert, setOuvert] = useState(false)

  const suggestions = useMemo(() => {
    const q = sansAccent(saisie.trim())
    return q ? communes.filter(c => sansAccent(c).includes(q)) : communes
  }, [saisie, communes])

  return (
    <div style={{ position: 'relative' }}>
      <span style={ETIQUETTE}>{etiquette}</span>
      <input
        value={ouvert ? saisie : (valeur ? nomLisible(valeur) : '')}
        onChange={e => { setSaisie(e.target.value); setOuvert(true) }}
        onFocus={() => { setSaisie(''); setOuvert(true) }}
        // Un délai : sans lui, le clic sur une suggestion est annulé par la
        // fermeture avant d'avoir été enregistré.
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        placeholder="Une commune…"
        style={CHAMP}
      />

      {/* L'arrêt exact, quand il y en a un — retirable pour revenir à toute
          la commune. C'est le filtre fin, et il n'est jamais obligatoire. */}
      {precis && !ouvert && (
        <button
          onClick={onEffacerPrecis}
          style={{
            marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 6,
            border: `1px solid ${couleur}`, background: `${couleur}14`, color: '#1A1209',
            borderRadius: 999, padding: '3px 9px', fontSize: 11.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
          }}
        >
          {lieuDe(precis)}
          <span style={{ color: '#7A6A5A', fontWeight: 800 }}>✕</span>
        </button>
      )}

      {ouvert && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 66, left: 0, right: 0, zIndex: 40,
          background: '#fff', border: '1px solid #E8E0D4', borderRadius: 11,
          boxShadow: '0 8px 24px rgba(44,28,16,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {suggestions.map(c => (
            // onMouseDown et pas onClick : le clic déclencherait le onBlur du
            // champ avant d'arriver ici.
            <button
              key={c}
              onMouseDown={() => { onChoisir(c); setOuvert(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'none', cursor: 'pointer', padding: '10px 12px',
                fontSize: 13.5, color: '#1A1209', fontFamily: 'var(--font-body), sans-serif',
                borderBottom: '1px solid #F5F0E8',
              }}
            >
              {nomLisible(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TransportPanneau({
  nomLigne, couleur, arrets, arretImpose, trajetChoisi, arretsDesservis,
  onCommunesChange, onChoisirTrajet, onFermer,
}: {
  nomLigne: string
  couleur: string
  arrets: ArretChoisissable[]
  arretImpose: { stop_id: string; role: 'depart' | 'arrivee' } | null
  trajetChoisi: string | null
  arretsDesservis: ArretDesservi[]
  onCommunesChange: (depart: string | null, arrivee: string | null) => void
  onChoisirTrajet: (t: { trip_id: string; arret_depart: string; arret_arrivee: string } | null) => void
  onFermer: () => void
}) {
  const [communeDepart, setCommuneDepart] = useState('')
  const [communeArrivee, setCommuneArrivee] = useState('')
  const [arretDepart, setArretDepart] = useState<string | null>(null)
  const [arretArrivee, setArretArrivee] = useState<string | null>(null)
  const [date, setDate] = useState(aujourdhuiParis)
  const [heure, setHeure] = useState(heureParis)
  const [trajets, setTrajets] = useState<Trajet[] | null>(null)
  const [nomsArrets, setNomsArrets] = useState<{ stop_id: string; nom: string }[]>([])
  const [plusRapide, setPlusRapide] = useState<number | null>(null)
  const [chargement, setChargement] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const communes = useMemo(
    () => Array.from(new Set(arrets.map(a => communeDe(a.nom)))).sort((a, b) => a.localeCompare(b, 'fr')),
    [arrets],
  )

  const nomDe = useCallback(
    (id: string) => arrets.find(a => a.stop_id === id)?.nom ?? nomsArrets.find(a => a.stop_id === id)?.nom ?? '',
    [arrets, nomsArrets],
  )

  const idsDe = useCallback((commune: string, precis: string | null): string[] => {
    // Le filtre fin s'il existe, sinon toute la commune. Jamais obligatoire :
    // sans arrêt désigné, on cherche sur les quatre arrêts de Ganges.
    //
    // ET SURTOUT : un arrêt désigné entraîne SES DEUX CÔTÉS. Le GTFS décrit
    // chaque sens de circulation comme un arrêt distinct — « GANGES - MONT
    // AIGOUAL » ne dessert que Montpellier, « GANGES - Mont Aigoual » que le
    // retour. Vérifié : 3 bus d'un côté, 0 de l'autre. Sans ce regroupement,
    // désigner le mauvais trottoir répondait « aucun bus » alors qu'il en
    // passe. On ne choisit pas un trottoir, on choisit un arrêt.
    if (precis) {
      const nom = sansAccent(nomDe(precis))
      const memeArret = arrets.filter(a => sansAccent(a.nom) === nom).map(a => a.stop_id)
      return memeArret.length > 0 ? memeArret : [precis]
    }
    return arrets.filter(a => communeDe(a.nom) === commune).map(a => a.stop_id)
  }, [arrets, nomDe])

  useEffect(() => {
    onCommunesChange(communeDepart || null, communeArrivee || null)
  }, [communeDepart, communeArrivee, onCommunesChange])

  const chercher = useCallback(async (
    cDep = communeDepart, cArr = communeArrivee,
    aDep = arretDepart, aArr = arretArrivee,
    j = date, h = heure,
  ) => {
    if (!cDep || !cArr) { setMessage('Indiquez d’où vous partez et où vous allez.'); return }
    const de = idsDe(cDep, aDep)
    const vers = idsDe(cArr, aArr)
    if (de.length === 0 || vers.length === 0) return
    if (de.some(x => vers.includes(x))) { setMessage('Le départ et l’arrivée sont au même endroit.'); return }

    setChargement(true); setMessage(null); setTrajets(null); onChoisirTrajet(null)
    try {
      const r = await fetch(`/api/transport/trajet?de=${de.join(',')}&vers=${vers.join(',')}&date=${j}&heure=${h}`)
      const d = await r.json()
      if (!r.ok) { setMessage(d.error ?? 'Recherche impossible.'); return }
      setTrajets(d.trajets ?? [])
      setNomsArrets(d.arrets ?? [])
      setPlusRapide(d.plus_rapide ?? null)
      if ((d.trajets ?? []).length === 0) setMessage(d.raison ?? 'Aucun bus dans ce sens après cette heure-là.')
    } catch {
      setMessage('Vérifiez votre connexion.')
    } finally {
      setChargement(false)
    }
  }, [communeDepart, communeArrivee, arretDepart, arretArrivee, date, heure, idsDe, onChoisirTrajet])

  // Un arrêt désigné sur la carte affine la recherche — et la relance
  // aussitôt. Sans ça, le geste ne servait à rien : la liste continuait de
  // montrer tous les bus, tous arrêts confondus.
  const dejaVu = useRef<string | null>(null)
  useEffect(() => {
    if (!arretImpose) return
    const cle = `${arretImpose.stop_id}:${arretImpose.role}`
    if (dejaVu.current === cle) return
    dejaVu.current = cle

    const nom = nomDe(arretImpose.stop_id)
    if (!nom) return
    const c = communeDe(nom)
    if (arretImpose.role === 'depart') {
      setCommuneDepart(c); setArretDepart(arretImpose.stop_id)
      if (communeArrivee) void chercher(c, communeArrivee, arretImpose.stop_id, arretArrivee)
    } else {
      setCommuneArrivee(c); setArretArrivee(arretImpose.stop_id)
      if (communeDepart) void chercher(communeDepart, c, arretDepart, arretImpose.stop_id)
    }
  }, [arretImpose, nomDe, communeDepart, communeArrivee, arretDepart, arretArrivee, chercher])

  const trajetOuvert = trajets?.find(t => t.trip_id === trajetChoisi) ?? null

  return (
    <div className="pcv-transport" style={{ fontFamily: 'var(--font-body), sans-serif', paddingBottom: 8 }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A1209' }}>Où allez-vous ?</p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#7A6A5A' }}>{nomLigne}</p>
        </div>
        <button onClick={onFermer} aria-label="Quitter le mode transport" style={{
          width: 30, height: 30, borderRadius: '50%', border: '1px solid #E8E0D4',
          background: '#fff', cursor: 'pointer', color: '#7A6A5A', flexShrink: 0,
        }}>✕</button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <ChampCommune
          etiquette="Départ" valeur={communeDepart} precis={arretDepart ? nomDe(arretDepart) : null}
          communes={communes} couleur={couleur}
          onChoisir={c => { setCommuneDepart(c); setArretDepart(null) }}
          onEffacerPrecis={() => { setArretDepart(null); void chercher(communeDepart, communeArrivee, null, arretArrivee) }}
        />
        <ChampCommune
          etiquette="Arrivée" valeur={communeArrivee} precis={arretArrivee ? nomDe(arretArrivee) : null}
          communes={communes} couleur={couleur}
          onChoisir={c => { setCommuneArrivee(c); setArretArrivee(null) }}
          onEffacerPrecis={() => { setArretArrivee(null); void chercher(communeDepart, communeArrivee, arretDepart, null) }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 118px', gap: 8 }}>
          <label>
            <span style={ETIQUETTE}>Jour</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={CHAMP} />
          </label>
          <label>
            <span style={ETIQUETTE}>À partir de</span>
            <input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={CHAMP} />
          </label>
        </div>

        <button onClick={() => void chercher()} disabled={chargement} style={{
          height: 44, borderRadius: 12, border: 'none', cursor: chargement ? 'default' : 'pointer',
          background: '#2D5A3D', color: '#fff', fontSize: 14, fontWeight: 800,
          opacity: chargement ? 0.6 : 1,
        }}>
          {chargement ? 'Recherche…' : 'Chercher'}
        </button>
      </div>

      {message && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#7A6A5A', lineHeight: 1.5 }}>{message}</p>
      )}

      {trajets && trajets.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: '#7A6A5A', lineHeight: 1.5 }}>
            {trajets.length} bus{(arretDepart || arretArrivee) ? ' à cet arrêt' : ''} · touchez-en un pour voir
            le détail{(arretDepart || arretArrivee) ? '' : ', ou désignez un arrêt sur la carte pour affiner'}
          </p>

          {trajets.map((t, i) => {
            const actif = t.trip_id === trajetChoisi
            return (
              <div key={t.trip_id}>
                <button
                  onClick={() => onChoisirTrajet(actif ? null : t)}
                  style={{
                    textAlign: 'left', width: '100%', cursor: 'pointer',
                    border: `1px solid ${actif ? couleur : '#F0EAE0'}`,
                    background: actif ? `${couleur}12` : '#fff',
                    borderRadius: 13, padding: '10px 12px',
                    fontFamily: 'var(--font-body), sans-serif',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1209' }}>
                      {t.depart.slice(0, 5)}
                      <span style={{ color: '#A99B89', margin: '0 6px', fontWeight: 600 }}>→</span>
                      {t.arrivee.slice(0, 5)}
                    </span>
                    <span style={{ fontSize: 12, color: '#7A6A5A' }}>{t.duree_min} min</span>
                    {i === plusRapide && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
                        color: '#fff', background: couleur, borderRadius: 999, padding: '2px 7px',
                      }}>le plus rapide</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#A99B89', marginTop: 3, lineHeight: 1.45 }}>
                    {lieuDe(nomDe(t.arret_depart))} → {lieuDe(nomDe(t.arret_arrivee))}
                    {t.arrets_intermediaires > 0 && ` · ${t.arrets_intermediaires} arrêts`}
                  </div>
                </button>

                {/* Le détail : chaque arrêt desservi avec son heure de passage.
                    C'est ici qu'on décide où monter — en connaissant l'heure,
                    au lieu de choisir un arrêt à l'aveugle avant la recherche. */}
                {actif && arretsDesservis.length > 0 && (
                  <div style={{
                    marginTop: 6, marginLeft: 8, paddingLeft: 12,
                    borderLeft: `2px solid ${couleur}`, display: 'grid', gap: 5,
                  }}>
                    {arretsDesservis.map((a, k) => {
                      const bord = k === 0 || k === arretsDesservis.length - 1
                      return (
                        <div key={`${a.stop_id}-${k}`} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                          <span style={{
                            fontSize: 12, fontWeight: bord ? 800 : 600,
                            color: bord ? '#1A1209' : '#7A6A5A', minWidth: 38,
                          }}>
                            {(a.heure ?? '').slice(0, 5)}
                          </span>
                          <span style={{
                            fontSize: 12, lineHeight: 1.35,
                            color: bord ? '#1A1209' : '#7A6A5A', fontWeight: bord ? 700 : 400,
                          }}>
                            {nomLisible(a.nom)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {trajetOuvert && arretsDesservis.length === 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#A99B89' }}>Détail du trajet…</p>
      )}

      {/* L'ODbL demande de citer la source. */}
      <p style={{ margin: '16px 0 0', fontSize: 10.5, color: '#A99B89', lineHeight: 1.45 }}>
        Horaires : réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)
      </p>
    </div>
  )
}
