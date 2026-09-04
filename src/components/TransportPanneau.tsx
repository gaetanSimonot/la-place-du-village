'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * Panneau du mode « Transport » : choisir un depart, une arrivee, un jour et
 * une heure, et lire les prochains bus.
 *
 * Le calcul est fait par /api/transport/trajet — ici on ne fait que poser la
 * question et afficher la reponse.
 *
 * Les noms d'arrets du GTFS sont en CAPITALES et prefixes de la commune
 * (« GANGES - MAIRIE »). On les rend lisibles a l'affichage sans toucher a la
 * donnee : elle doit rester celle de la source, c'est elle qui fait foi.
 */

export interface ArretChoisissable { stop_id: string; nom: string }

interface Trajet {
  trip_id: string
  depart: string
  arrivee: string
  duree_min: number
  arrets_intermediaires: number
  destination: string | null
}

/** « GANGES - MAIRIE » → « Ganges — Mairie ». */
export function nomLisible(brut: string): string {
  return brut
    .split(/\s*-\s*/)
    .map(part => part.trim().toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, s, c) => s + c.toUpperCase()))
    .join(' — ')
}

/** La date du jour vue de Paris — pas celle du serveur, qui tourne en UTC. */
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

export default function TransportPanneau({
  nomLigne, arrets, arretClique, onFermer,
}: {
  nomLigne: string
  arrets: ArretChoisissable[]
  /** Un arrêt cliqué sur la carte : il remplit le départ, puis l'arrivée. */
  arretClique: string | null
  onFermer: () => void
}) {
  const [de, setDe] = useState('')
  const [vers, setVers] = useState('')
  const [date, setDate] = useState(aujourdhuiParis)
  const [heure, setHeure] = useState(heureParis)
  const [trajets, setTrajets] = useState<Trajet[] | null>(null)
  const [chargement, setChargement] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const tries = useMemo(
    () => [...arrets].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [arrets],
  )

  // Un clic sur la carte remplit le premier champ vide. C'est le geste
  // naturel : on montre son départ, puis son arrivée.
  useEffect(() => {
    if (!arretClique) return
    setDe(d => {
      if (!d) return arretClique
      setVers(v => (v ? v : arretClique))
      return d
    })
  }, [arretClique])

  async function chercher() {
    if (!de || !vers) { setMessage('Choisissez un départ et une arrivée.'); return }
    if (de === vers) { setMessage('Le départ et l’arrivée sont le même arrêt.'); return }
    setChargement(true); setMessage(null); setTrajets(null)
    try {
      const r = await fetch(`/api/transport/trajet?de=${encodeURIComponent(de)}&vers=${encodeURIComponent(vers)}&date=${date}&heure=${heure}`)
      const d = await r.json()
      if (!r.ok) { setMessage(d.error ?? 'Recherche impossible.'); return }
      setTrajets(d.trajets ?? [])
      if ((d.trajets ?? []).length === 0) {
        setMessage(d.raison ?? 'Aucun bus après cette heure-là ce jour-ci.')
      }
    } catch {
      setMessage('Vérifiez votre connexion.')
    } finally {
      setChargement(false)
    }
  }

  const champ: React.CSSProperties = {
    width: '100%', height: 40, borderRadius: 10, border: '1px solid #E8E0D4',
    background: '#fff', padding: '0 10px', fontSize: 13.5, color: '#1A1209',
    fontFamily: 'var(--font-body), sans-serif',
  }
  const etiquette: React.CSSProperties = {
    display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em',
    textTransform: 'uppercase', color: '#7A6A5A', marginBottom: 4,
  }

  return (
    // Pas de cadre ni d'ombre : ce panneau vit DANS la feuille, qui porte deja
    // son fond et ses bords. Un encadre dans un encadre ferait boite dans boite.
    <div className="pcv-transport" style={{ fontFamily: 'var(--font-body), sans-serif', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A1209' }}>{nomLigne}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#7A6A5A' }}>
            Cliquez un arrêt sur la carte pour le choisir
          </p>
        </div>
        <button onClick={onFermer} aria-label="Fermer le mode transport" style={{
          width: 30, height: 30, borderRadius: '50%', border: '1px solid #E8E0D4',
          background: '#fff', cursor: 'pointer', color: '#7A6A5A', flexShrink: 0,
        }}>✕</button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          <span style={etiquette}>Départ</span>
          <select value={de} onChange={e => setDe(e.target.value)} style={champ}>
            <option value="">Choisir un arrêt…</option>
            {tries.map(a => <option key={a.stop_id} value={a.stop_id}>{nomLisible(a.nom)}</option>)}
          </select>
        </label>

        <label>
          <span style={etiquette}>Arrivée</span>
          <select value={vers} onChange={e => setVers(e.target.value)} style={champ}>
            <option value="">Choisir un arrêt…</option>
            {tries.map(a => <option key={a.stop_id} value={a.stop_id}>{nomLisible(a.nom)}</option>)}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
          <label>
            <span style={etiquette}>Jour</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={champ} />
          </label>
          <label>
            <span style={etiquette}>À partir de</span>
            <input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={champ} />
          </label>
        </div>

        <button onClick={chercher} disabled={chargement} style={{
          height: 42, borderRadius: 11, border: 'none', cursor: chargement ? 'default' : 'pointer',
          background: '#2D5A3D', color: '#fff', fontSize: 13.5, fontWeight: 800,
          opacity: chargement ? 0.6 : 1,
        }}>
          {chargement ? 'Recherche…' : 'Voir les horaires'}
        </button>
      </div>

      {message && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#7A6A5A', lineHeight: 1.5 }}>{message}</p>
      )}

      {trajets && trajets.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {trajets.map(t => (
            <div key={t.trip_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              border: '1px solid #F0EAE0', borderRadius: 12, padding: '9px 11px',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1209', whiteSpace: 'nowrap' }}>
                {t.depart.slice(0, 5)}
                <span style={{ color: '#A99B89', margin: '0 5px', fontWeight: 600 }}>→</span>
                {t.arrivee.slice(0, 5)}
              </div>
              <div style={{ fontSize: 11.5, color: '#7A6A5A', minWidth: 0 }}>
                {t.duree_min} min
                {t.arrets_intermediaires > 0 && ` · ${t.arrets_intermediaires} arrêts`}
                {t.destination && (
                  <span style={{ display: 'block', color: '#A99B89', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    vers {t.destination}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* L'ODbL demande de citer la source. */}
      <p style={{ margin: '14px 0 0', fontSize: 10.5, color: '#A99B89', lineHeight: 1.45 }}>
        Horaires : réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)
      </p>
    </div>
  )
}
