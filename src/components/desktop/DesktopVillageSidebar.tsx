'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

/**
 * COLONNE DE DROITE DU VILLAGE — version ordinateur.
 *
 * Masquée en dessous de 1024 px par `.pcv-only` : le mobile ne voit rien,
 * son fil reste exactement ce qu'il était.
 *
 * Toutes les données viennent de /api/hub, qui les servait déjà à l'ancien
 * écran d'accueil. Aucune nouvelle route, aucune donnée inventée : les
 * encarts qui n'ont pas de source réelle ne sont pas affichés (voir la note
 * sur la météo plus bas).
 */

interface Promo {
  id: string
  title?: string | null
  display_image_url?: string | null
  image_url?: string | null
  etablissement_nom?: string | null
}

interface Vente {
  id: string
  titre?: string | null
  photos?: string[] | null
  prix?: number | null
  type?: string | null
}

interface HubPayload {
  promos?: Promo[]
  ventes?: Vente[]
  todayTotal?: number
}

/** Coquille commune : un titre, un contenu, un pied cliquable. */
function Carte({ titre, children, lien }: {
  titre: string
  children: React.ReactNode
  lien?: { href: string; label: string }
}) {
  return (
    <section className="pcv-sbCard">
      <h3 className="pcv-sbTitre">{titre}</h3>
      <div className="pcv-sbCorps">{children}</div>
      {lien && (
        <Link href={lien.href} className="pcv-sbPied">
          {lien.label}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </Link>
      )}
    </section>
  )
}

/** Ligne d'un encart : vignette + deux lignes de texte. */
function Ligne({ href, photo, titre, sous }: {
  href: string; photo?: string | null; titre: string; sous?: string | null
}) {
  return (
    <Link href={href} className="pcv-sbLigne pcv-hoverRow">
      <span className="pcv-sbVignette">
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" loading="lazy" />
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>}
      </span>
      <span className="pcv-sbTexte">
        <span className="pcv-sbNom">{titre}</span>
        {sous && <span className="pcv-sbSous">{sous}</span>}
      </span>
    </Link>
  )
}

/** Zone d'affichage, lue là où l'app la range. */
function useZone(): { nom: string; rayon: number } {
  const [zone, setZone] = useState({ nom: 'Ganges', rayon: 30 })
  useEffect(() => {
    try {
      const brut = localStorage.getItem('pdv-zone-user')
      if (!brut) return
      const z = JSON.parse(brut) as { nom?: string; rayon?: number }
      setZone({ nom: z.nom?.trim() || 'Ganges', rayon: z.rayon ?? 30 })
    } catch { /* zone par défaut */ }
  }, [])
  return zone
}

export default function DesktopVillageSidebar() {
  const { profile } = useAuth()
  const zone = useZone()
  const [hub, setHub] = useState<HubPayload | null>(null)

  useEffect(() => {
    let vivant = true
    fetch('/api/hub')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivant && d) setHub(d as HubPayload) })
      .catch(() => { /* la colonne se contente de moins */ })
    return () => { vivant = false }
  }, [])

  const promos = (hub?.promos ?? []).slice(0, 3)
  const ventes = (hub?.ventes ?? []).slice(0, 3)
  const estPartenaire = profile?.plan === 'pro'

  return (
    <aside className="pcv-only pcv-sbCol pcv-scroll">

      {/* Autour de chez soi — la carte est à un clic, on ne la duplique pas
          ici en vignette morte. */}
      <Carte titre={`Autour de ${zone.nom}`} lien={{ href: '/?mode=agenda', label: 'Voir sur la carte' }}>
        <p className="pcv-sbPhrase">
          Vous voyez ce qui se passe dans un rayon de <strong>{zone.rayon} km</strong>.
          {typeof hub?.todayTotal === 'number' && hub.todayTotal > 0 && (
            <> {hub.todayTotal} événement{hub.todayTotal > 1 ? 's' : ''} aujourd’hui.</>
          )}
        </p>
      </Carte>

      {/* Bons plans en cours */}
      {promos.length > 0 && (
        <Carte titre="Bons plans en cours" lien={{ href: '/promotions', label: 'Tous les bons plans' }}>
          {promos.map(p => (
            <Ligne
              key={p.id}
              href="/promotions"
              photo={p.display_image_url ?? p.image_url ?? null}
              titre={p.title ?? 'Bon plan'}
              sous={p.etablissement_nom ?? null}
            />
          ))}
        </Carte>
      )}

      {/* Dernières annonces */}
      {ventes.length > 0 && (
        <Carte titre="Dernières annonces" lien={{ href: '/annonces', label: 'Toutes les annonces' }}>
          {ventes.map(v => (
            <Ligne
              key={v.id}
              href={`/annonces/${v.id}`}
              photo={v.photos?.[0] ?? null}
              titre={v.titre ?? 'Annonce'}
              sous={typeof v.prix === 'number' ? `${v.prix} €` : null}
            />
          ))}
        </Carte>
      )}

      {/* La lettre du village */}
      <Carte titre="La lettre du village" lien={{ href: '/newsletter', label: 'S’y abonner' }}>
        <p className="pcv-sbPhrase">
          Chaque lundi, ce qu’il ne fallait pas manquer : les événements de la
          semaine, les bons plans et les nouvelles du Journal.
        </p>
      </Carte>

      {/* Devenir Partenaire — inutile de le proposer à qui l'est déjà. */}
      {!estPartenaire && (
        <Carte titre="Vous tenez un commerce ?" lien={{ href: '/abonnements', label: 'Devenir Partenaire Local' }}>
          <p className="pcv-sbPhrase">
            Votre fiche, vos bons plans, votre place à la une de votre catégorie.
            Tout ce qu’il faut pour être trouvé par les habitants.
          </p>
        </Carte>
      )}

      {/* NOTE — la maquette prévoit aussi un encart Météo. Il n'existe aucune
          source météo dans l'app : l'afficher voudrait dire inventer des
          chiffres. Il attend une vraie intégration. */}
    </aside>
  )
}
