'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * LES INVITÉS D'UN MODULE — des habitants nommés qui voient la section
 * pendant son rodage, sans être administrateurs.
 *
 * Montrer le théâtre à la programmatrice du théâtre avant de l'ouvrir au
 * village : c'est le seul moyen d'avoir un avis sur un module neuf sans
 * faire de cette personne une administratrice de toute l'application.
 *
 * Trois partis pris :
 *
 * — Le bloc ne s'affiche QUE sur « Admin ». En « Masqué » personne ne voit
 *   rien, invités compris ; en « Tous » tout le village voit déjà. Dans les
 *   deux cas, une liste d'invités ne veut rien dire — la montrer laisserait
 *   croire qu'elle agit.
 * — La liste des membres n'est chargée qu'à l'ouverture du sélecteur. C'est
 *   l'annuaire entier : on ne le fait pas venir pour un écran qu'on ne
 *   déplie pas.
 * — La liste ne vit PAS dans `config`, qui est lisible par n'importe quel
 *   visiteur : y ranger des identifiants de comptes publierait qui a été
 *   choisi. Elle passe par `/api/admin/invites`, réservée aux admins, et
 *   dort dans une table fermée.
 */

interface Membre {
  id: string
  email: string
  name: string
  display_name: string | null
  avatar: string
}

export default function ChoixInvites({ cleVisibilite, slugTerritoire, invites, onChange }: {
  /** Par exemple `theatre_village_public`. La clé des invités en découle. */
  cleVisibilite: string
  /** `null` pour le territoire par défaut. */
  slugTerritoire: string | null
  invites: string[]
  onChange: (suivants: string[]) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [membres, setMembres] = useState<Membre[] | null>(null)
  const [chargement, setChargement] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [enCours, setEnCours] = useState(false)

  const urlInvites = `/api/admin/invites?cle=${encodeURIComponent(cleVisibilite)}`
    + (slugTerritoire ? `&territoire=${encodeURIComponent(slugTerritoire)}` : '')

  async function jeton(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // La liste au chargement. Elle ne peut pas venir avec les réglages de
  // `config` : elle n'y est pas, justement.
  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const r = await fetch(urlInvites, { headers: { Authorization: `Bearer ${await jeton()}` } })
        const j = await r.json()
        if (vivant && Array.isArray(j.invites)) onChange(j.invites)
      } catch { /* la table n'existe pas encore : personne n'est invité */ }
    })()
    return () => { vivant = false }
    // Volontairement sur la seule URL : `onChange` change à chaque rendu du
    // parent et relancerait la lecture en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInvites])

  // L'annuaire ne vient qu'à l'ouverture — et une seule fois.
  useEffect(() => {
    if (!ouvert || membres || chargement) return
    setChargement(true)
    ;(async () => {
      try {
        const r = await fetch('/api/admin/membres', {
          headers: { Authorization: `Bearer ${await jeton()}` },
        })
        const j = await r.json()
        setMembres(Array.isArray(j.membres) ? j.membres : [])
      } catch {
        setMembres([])
      } finally {
        setChargement(false)
      }
    })()
  }, [ouvert, membres, chargement])

  const nomDe = (m: Membre) => m.display_name || m.name || m.email || 'Sans nom'

  /** Les invités déjà choisis, avec leur nom quand on l'a. */
  const choisis = useMemo(() => invites.map(id => ({
    id, membre: membres?.find(m => m.id === id) ?? null,
  })), [invites, membres])

  /**
   * Les résultats. On ne liste RIEN sans recherche : l'annuaire entier
   * déroulé sous un réglage n'aide personne, et on cherche une personne
   * précise — celle à qui on veut montrer le module.
   */
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q || !membres) return []
    return membres
      .filter(m => !invites.includes(m.id))
      .filter(m => nomDe(m).toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 8)
  }, [recherche, membres, invites])

  /**
   * Écrit la liste ENTIÈRE, à chaque changement.
   *
   * L'état local est remis à l'ancienne valeur si l'écriture échoue : sans
   * ça, l'écran montrerait un invité qui n'existe pas en base, et on
   * croirait la personne prévenue.
   */
  async function enregistrer(suivants: string[]) {
    if (enCours) return
    const avant = invites
    onChange(suivants)
    setEnCours(true)
    try {
      const r = await fetch(urlInvites, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jeton()}` },
        body: JSON.stringify({ invites: suivants }),
      })
      if (!r.ok) onChange(avant)
    } catch {
      onChange(avant)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #EFE7DC' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1A1209' }}>
          Aussi visible par
          {invites.length > 0 && (
            <span style={{ marginLeft: 6, fontWeight: 700, color: '#C0440A' }}>{invites.length}</span>
          )}
        </div>
        <button onClick={() => setOuvert(o => !o)}
          style={{
            border: 'none', background: 'transparent', padding: 0,
            fontSize: 11.5, fontWeight: 700, color: '#C0440A', cursor: 'pointer',
            fontFamily: 'var(--font-body), sans-serif',
          }}>
          {ouvert ? 'Fermer' : 'Choisir un membre'}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: '#7A6A5A', marginTop: 2, lineHeight: 1.45 }}>
        Des habitants qui verront la section pendant le rodage, sans être admins.
      </div>

      {/* Les invités retenus, toujours visibles : c'est l'état du réglage. */}
      {choisis.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {choisis.map(({ id, membre }) => (
            <span key={id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                borderRadius: 999, padding: '5px 8px 5px 10px',
                background: '#FFF8F3', border: '1px solid #F0B08A',
                fontSize: 11.5, fontWeight: 700, color: '#1A1209',
              }}>
              {/* Sans l'annuaire chargé, on n'a que l'identifiant : on le dit
                  plutôt que d'afficher un nom qu'on ne connaît pas. */}
              {membre ? (membre.display_name || membre.name || membre.email) : `${id.slice(0, 8)}…`}
              <button onClick={() => enregistrer(invites.filter(x => x !== id))}
                disabled={enCours} aria-label="Retirer"
                style={{
                  border: 'none', background: 'transparent', padding: 0, lineHeight: 0,
                  color: '#A8896F', cursor: enCours ? 'default' : 'pointer',
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {ouvert && (
        <div style={{ marginTop: 8 }}>
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder={chargement ? 'Chargement de l’annuaire…' : 'Nom ou adresse e-mail'}
            disabled={chargement}
            style={{
              width: '100%', borderRadius: 9, border: '1px solid #E5DDD2',
              background: '#FDFAF5', padding: '9px 11px', fontSize: 12.5,
              color: '#1A1209', fontFamily: 'var(--font-body), sans-serif',
            }}
          />
          {recherche.trim() && resultats.length === 0 && !chargement && (
            <div style={{ fontSize: 11.5, color: '#8A7A6A', marginTop: 8 }}>
              Personne à ce nom.
            </div>
          )}
          {resultats.map(m => (
            <button key={m.id}
              onClick={() => { enregistrer([...invites, m.id]); setRecherche('') }}
              disabled={enCours}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                marginTop: 6, padding: '7px 9px', borderRadius: 9, textAlign: 'left',
                border: '1px solid #E5DDD2', background: '#FFFFFF',
                cursor: enCours ? 'default' : 'pointer',
                fontFamily: 'var(--font-body), sans-serif',
              }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, overflow: 'hidden', flex: 'none',
                background: '#F2EADF', display: 'block',
              }}>
                {m.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : null}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nomDe(m)}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.email}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
