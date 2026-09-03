'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { CATEGORIES_LABELS, type AnnonceCategorie } from '@/lib/annonces'

/**
 * COLONNE DE DROITE DU VILLAGE — version ordinateur.
 *
 * Masquée en dessous de 1024 px par `.pcv-only` : le mobile ne voit rien, son
 * fil reste exactement ce qu'il était.
 *
 * Ordre voulu : la zone d'abord — c'est elle qui répond à « où suis-je ? » —
 * puis ce qui se passe (bons plans, annonces), puis la lettre.
 *
 * Toutes les données viennent de /api/hub, qui les servait déjà à l'ancien
 * écran d'accueil. Aucune route nouvelle, aucune donnée inventée.
 */

interface Promo {
  id: string
  title?: string | null
  display_image_url?: string | null
  image_url?: string | null
  etablissement?: { nom?: string | null } | null
}

interface Vente {
  id: string
  titre?: string | null
  photos?: string[] | null
  categorie?: string | null
}

interface HubPayload {
  promos?: Promo[]
  ventes?: Vente[]
  todayTotal?: number
}

const Fleche = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
  </svg>
)

/**
 * Coquille d'encart : le titre à gauche, le lien « voir tout » sur la MÊME
 * ligne à droite. Il était en pied de carte ; en tête, il se voit sans avoir
 * à parcourir la liste.
 */
function Carte({ titre, lien, children }: {
  titre: string
  lien?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="pcv-sbCard">
      <div className="pcv-sbHead">
        <h3>{titre}</h3>
        {lien && <Link href={lien.href} className="pcv-sbHeadLien">{lien.label}<Fleche /></Link>}
      </div>
      <div className="pcv-sbCorps">{children}</div>
    </section>
  )
}

/** Ligne : vignette carrée, titre en gras, contexte en gris dessous. */
function Ligne({ href, photo, titre, sous }: {
  href: string; photo?: string | null; titre: string; sous?: string | null
}) {
  return (
    <Link href={href} className="pcv-sbLigne">
      <span className="pcv-sbVignette">
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" loading="lazy" />
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>}
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
  const [zone, setZone] = useState({ nom: 'Ganges', rayon: 45 })
  useEffect(() => {
    try {
      const brut = localStorage.getItem('pdv-zone-user')
      if (!brut) return
      const z = JSON.parse(brut) as { nom?: string; rayon?: number }
      setZone({ nom: z.nom?.trim() || 'Ganges', rayon: z.rayon ?? 45 })
    } catch { /* zone par défaut */ }
  }, [])
  return zone
}

/**
 * Vignette de la zone.
 *
 * C'est un SCHÉMA, pas une carte : le cercle du rayon et le point du village,
 * sur un fond neutre. L'API Static Maps de Google n'est pas activée sur la clé
 * du projet (elle répond 403) ; plutôt que d'afficher un cadre cassé ou de
 * faire passer un dessin pour une carte, on assume le schéma. Le jour où
 * l'API est activée, l'image réelle prend sa place ici sans rien changer
 * d'autre.
 */
function VignetteZone({ nom, rayon }: { nom: string; rayon: number }) {
  return (
    <div className="pcv-sbMap" aria-label={`Zone d’affichage : ${nom} et ${rayon} km autour`}>
      <span className="pcv-sbMapRayon">{rayon} km</span>
      <span className="pcv-sbMapCercle" aria-hidden />
      <span className="pcv-sbMapPin" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
          <circle cx="12" cy="10" r="2.6" fill="#fff" />
        </svg>
      </span>
      <span className="pcv-sbMapNom">{nom}</span>
    </div>
  )
}

export default function DesktopVillageSidebar({ encartPromo }: { encartPromo?: React.ReactNode }) {
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

      {/* ── La zone, en tête : elle répond à « où suis-je ? » ────────── */}
      <section className="pcv-sbCard">
        <div className="pcv-sbHead"><h3>Autour de {zone.nom}</h3></div>
        <div className="pcv-sbCorps">
          <VignetteZone nom={zone.nom} rayon={zone.rayon} />
          {typeof hub?.todayTotal === 'number' && (
            <p className="pcv-sbLigneInfo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2.5" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {hub.todayTotal} événement{hub.todayTotal > 1 ? 's' : ''} aujourd’hui
            </p>
          )}
        </div>
        <Link href="/?mode=agenda" className="pcv-sbPied"
              onClick={() => window.dispatchEvent(new CustomEvent('pdv-vue', { detail: 'carte' }))}>
          Voir sur la carte<Fleche />
        </Link>
      </section>

      {/* ── Bons plans en cours ──────────────────────────────────────── */}
      {promos.length > 0 && (
        <Carte titre="Bons plans en cours" lien={{ href: '/promotions', label: 'Voir tous' }}>
          {promos.map(p => (
            <Ligne
              key={p.id}
              href="/promotions"
              photo={p.display_image_url ?? p.image_url ?? null}
              titre={p.title ?? 'Bon plan'}
              sous={p.etablissement?.nom ?? null}
            />
          ))}
        </Carte>
      )}

      {/* Encart d'abonnement, entre les deux listes. */}
      {encartPromo}

      {/* ── Dernières annonces ───────────────────────────────────────── */}
      {ventes.length > 0 && (
        <Carte titre="Dernières annonces" lien={{ href: '/annonces', label: 'Voir toutes' }}>
          {ventes.map(v => (
            <Ligne
              key={v.id}
              href={`/annonces/${v.id}`}
              photo={v.photos?.[0] ?? null}
              titre={v.titre ?? 'Annonce'}
              sous={v.categorie ? CATEGORIES_LABELS[v.categorie as AnnonceCategorie] ?? null : null}
            />
          ))}
        </Carte>
      )}

      {/* ── La lettre du village, en dessous ─────────────────────────── */}
      <Newsletter />

      {/* Devenir Partenaire — inutile de le proposer à qui l'est déjà. */}
      {!estPartenaire && (
        <section className="pcv-sbCard">
          <div className="pcv-sbHead"><h3>Vous tenez un commerce ?</h3></div>
          <div className="pcv-sbCorps">
            <p className="pcv-sbPhrase">
              Votre fiche, vos bons plans, votre place à la une de votre catégorie.
              Tout ce qu’il faut pour être trouvé par les habitants.
            </p>
          </div>
          <div className="pcv-sbAction">
            <Link href="/abonnements" className="pcv-sbBtn">Découvrir<Fleche /></Link>
          </div>
        </section>
      )}

      {/* NOTE — la maquette prévoit aussi un encart Météo. Il n'existe aucune
          source météo dans l'app : l'afficher voudrait dire inventer des
          chiffres. Il attend une vraie intégration. */}
    </aside>
  )
}

/**
 * La lettre du village — gabarit de la maquette : titre, phrase, puis
 * l'adresse et le bouton sur une même ligne.
 *
 * Rien n'est recodé : le champ mène à /newsletter, l'écran d'inscription qui
 * existe déjà, avec l'adresse déjà saisie en paramètre.
 */
function Newsletter() {
  const [email, setEmail] = useState('')
  return (
    <section className="pcv-sbCard pcv-news">
      <div className="pcv-sbHead"><h3>La newsletter du village</h3></div>
      <div className="pcv-sbCorps">
        <p className="pcv-sbPhrase">
          Chaque semaine : les temps forts, les bons plans et les actualités locales.
        </p>
      </div>
      <form
        className="pcv-newsRow"
        onSubmit={e => {
          e.preventDefault()
          const q = email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''
          window.location.href = `/newsletter${q}`
        }}
      >
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Votre email"
          aria-label="Votre adresse email"
        />
        <button type="submit">S’abonner</button>
      </form>
    </section>
  )
}
