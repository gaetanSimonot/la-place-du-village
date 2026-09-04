'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ETAB_TYPE_LIST } from '@/lib/etablissement-types'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie } from '@/lib/types'
import { imageEvenement } from '@/lib/imageEvenement'
import { choisirTuilesDuJour } from '@/lib/hubTodayPicker'
import { texteBrut } from '@/components/TexteRiche'

/**
 * SECTIONS DE L'ACCUEIL — version ordinateur (handoff §4).
 *
 *   1. À la une aujourd'hui
 *   2. Ils font vivre notre territoire
 *   3. L'agenda de la semaine
 *
 * Règle du handoff : une seule ligne, trois tuiles au plus, le reste part
 * derrière le lien « Voir tout ». Six vignettes pour le territoire.
 *
 * Masquées en dessous de 1024 px : le mobile garde ses propres sections.
 *
 * Les catégories du territoire viennent de ETAB_TYPE_LIST, pas des libellés
 * d'illustration de la maquette (handoff §12.3 : ne rien inventer).
 */

interface Evenement {
  id: string
  titre: string
  date_debut?: string | null
  heure?: string | null
  categorie?: string | null
  /* Le repli par catégorie a besoin des DEUX : un « concert au marché » doit
     garder le traitement d'un concert. L'API les envoyait déjà, l'interface
     ne les déclarait pas. */
  categories?: string[] | null
  image_url?: string | null
  /* Le cadrage choisi à la main dans l'admin. La carte mobile s'en sert
     depuis toujours ; cette tuile l'ignorait, et rognait donc les affiches
     A4 en plein milieu — souvent du papier blanc. */
  image_position?: string | null
  lieux?: { nom?: string | null; commune?: string | null } | null
}

interface Etablissement {
  id: string
  nom: string
  commune?: string | null
  type?: string | null
  photos?: string[] | null
  description_courte?: string | null
  is_featured?: boolean | null
  plan?: string | null
}

const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
)

/** En-tête de section : titre, sous-titre, lien « voir tout ». */
function Entete({ titre, sous, lien }: {
  titre: string; sous?: string; lien: { href: string; label: string; vue?: string }
}) {
  return (
    <div className="pcv-bh">
      <div>
        <h2>{titre}</h2>
        {sous && <div className="pcv-sub">{sous}</div>}
      </div>
      {/* La coquille d'accueil reste montée derrière une navigation douce :
          on la prévient, sinon l'adresse change sans que l'écran suive. */}
      <Link className="pcv-more" href={lien.href}
            onClick={() => lien.vue && window.dispatchEvent(new CustomEvent('pdv-vue', { detail: lien.vue }))}>
        {lien.label} <span>→</span>
      </Link>
    </div>
  )
}

/** Tuile d'événement — gabarit `.ev` de la maquette. */
function TuileEvenement({ ev }: { ev: Evenement }) {
  const lieu = ev.lieux?.commune ?? ev.lieux?.nom ?? null
  const imageDeLaTuile = imageEvenement(ev)
  return (
    <Link href={`/evenement/${ev.id}`} className="pcv-card pcv-ev">
      <span className="pcv-imw">
        {/* imageEvenement() et pas ev.image_url : sans affiche, l'événement
            reçoit le motif de sa catégorie. Ce helper sert déjà partout sur
            mobile (EventCard, BottomSheet, HubView) ; cette tuile-ci le
            court-circuitait et laissait un cadre vide. Un tiers des
            événements d'une semaine n'a pas d'affiche — les marchés et les
            ateliers surtout — et « une liste de cadres vides donne
            l'impression qu'il ne se passe rien ». */}
        {imageDeLaTuile
          // eslint-disable-next-line @next/next/no-img-element
          ? <img
              src={imageDeLaTuile}
              alt=""
              loading="lazy"
              // Le cadrage réglé dans l'admin, comme sur mobile — et seulement
              // pour la vraie affiche : un motif de repli se cadre au centre.
              style={{ objectPosition: ev.image_url ? (ev.image_position ?? '50% 50%') : '50% 50%' }}
            />
          : <span className="pcv-imVide" />}
        {ev.heure && <span className="pcv-hb">{ev.heure.slice(0, 5)}</span>}
      </span>
      <span className="pcv-evB">
        {ev.categorie && (
          <span className="pcv-kicker">
            {CATEGORIES[ev.categorie as Categorie]?.label ?? ev.categorie}
          </span>
        )}
        <h4>{ev.titre}</h4>
        {ev.lieux?.nom && <span className="pcv-ss">{ev.lieux.nom}</span>}
        <span className="pcv-lo"><PinIcon />{lieu ?? 'Autour de Ganges'}</span>
      </span>
    </Link>
  )
}

export default function DesktopVillageSections() {
  const [aujourdhui, setAujourdhui] = useState<Evenement[]>([])
  const [semaine, setSemaine]       = useState<Evenement[]>([])
  const [etabs, setEtabs]           = useState<Etablissement[]>([])
  const [catActive, setCatActive]   = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    Promise.all([
      fetch('/api/hub').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/agenda?quand=cette_semaine').then(r => (r.ok ? r.json() : null)).catch(() => null),
      // Plus d'appel à /api/village/counts : le carrousel ne montre que les
      // partenaires, il n'a plus à annoncer le total de l'annuaire.
      fetch('/api/annuaire').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([hub, agenda, annuaire]) => {
      if (!vivant) return
      if (hub?.todayEvents)          setAujourdhui(hub.todayEvents as Evenement[])
      if (agenda?.evenements)        setSemaine(agenda.evenements as Evenement[])
      if (annuaire?.etablissements)  setEtabs(annuaire.etablissements as Etablissement[])
    })
    return () => { vivant = false }
  }, [])

  /** Catégories réellement présentes dans les événements de la semaine. */
  const categories = useMemo(() => {
    const vues = new Set<string>()
    semaine.forEach(e => { if (e.categorie) vues.add(e.categorie) })
    return Array.from(vues).slice(0, 6)
  }, [semaine])

  /**
   * Les trois tuiles de « L'agenda de la semaine ».
   *
   * Sous une catégorie choisie, on prend simplement les trois premiers : la
   * question est déjà tranchée par le filtre.
   *
   * Sous « Tout », non : il y a une dizaine de marchés par semaine, tous tôt
   * le matin, et pris dans l'ordre ils raflaient les trois places — un
   * concert du samedi ne remontait jamais. `choisirTuilesDuJour` règle
   * exactement ça et sert déjà aux tuiles « Aujourd'hui » : un marché au
   * maximum, jamais deux fois la même catégorie, et l'ordre de préférence met
   * le marché en dernier parce qu'il revient chaque semaine — il a moins de
   * valeur d'annonce qu'un spectacle qui n'arrive qu'une fois.
   */
  const semaineFiltree = useMemo(
    () => (catActive
      ? semaine.filter(e => e.categorie === catActive).slice(0, 3)
      : choisirTuilesDuJour(semaine, new Map(), 3)),
    [semaine, catActive],
  )

  /**
   * Ce carrousel n'est PAS un aperçu de l'annuaire : c'est la vitrine de ceux
   * qui soutiennent le village. Deux portes d'entrée, et deux seulement —
   * avoir pris un plan Partenaire Local, ou avoir été mis à la une à la main
   * depuis l'admin. Les 1400 autres fiches n'ont rien à faire ici : elles ont
   * leur place dans l'annuaire, à un clic.
   *
   * Le premier jet complétait avec des fiches ordinaires quand les mises en
   * avant manquaient. C'était un contresens : mieux vaut douze partenaires
   * que douze inconnus qui ressemblent à des partenaires.
   *
   * La photo est indispensable — le carrousel est fait d'images.
   */
  const partenaires = useMemo(
    () => etabs.filter(e =>
      (e.photos?.length ?? 0) > 0
      && (e.is_featured || e.plan === 'pro' || e.plan === 'max'),
    ),
    [etabs],
  )

  return (
    <div className="pcv-only pcv-sections">

      {/* ── 1. À la une aujourd'hui ─────────────────────────────────── */}
      {aujourdhui.length > 0 && (
        <section>
          <Entete
            titre="À la une aujourd’hui"
            sous="Ce qui se passe dans la vallée d’ici ce soir"
            lien={{ href: '/?mode=agenda', label: 'Voir tout l’agenda', vue: 'carte' }}
          />
          <div className="pcv-g3">
            {aujourdhui.slice(0, 3).map(e => <TuileEvenement key={e.id} ev={e} />)}
          </div>
        </section>
      )}

      {/* ── 2. Ils font vivre notre territoire ──────────────────────── */}
      {partenaires.length > 0 && (
        <section>
          <Entete
            titre="Partenaires à la une"
            sous="Ils font vivre notre territoire"
            lien={{ href: '/?mode=annuaire', label: 'Voir tous les partenaires', vue: 'annuaire' }}
          />
          {/* Une seule ligne qui défile en boucle. La liste est écrite deux
              fois : la deuxième copie prend le relais quand la première sort
              de l'écran, ce qui rend la boucle invisible. Elle est cachée aux
              lecteurs d'écran pour ne pas annoncer chaque fiche en double. */}
          <div className="pcv-carrousel">
            <div className="pcv-piste" style={{ ['--pcv-n' as string]: partenaires.length }}>
              {[...partenaires, ...partenaires].map((e, i) => (
              <Link key={`${e.id}-${i}`} href={`/etablissement/${e.id}`} className="pcv-pa"
                    aria-hidden={i >= partenaires.length}
                    tabIndex={i >= partenaires.length ? -1 : undefined}>
                <span className="pcv-ph2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.photos![0]} alt="" loading="lazy" />
                </span>
                <span className="pcv-b2">
                  <h4>{e.nom}</h4>
                  <span className="pcv-mt">
                    {ETAB_TYPE_LIST.find(t => t.id === e.type)?.label
                      ?? (e.description_courte ? texteBrut(e.description_courte).slice(0, 40) : '')}
                  </span>
                  {e.commune && <span className="pcv-cm">{e.commune}</span>}
                </span>
              </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 3. L'agenda de la semaine ───────────────────────────────── */}
      {semaine.length > 0 && (
        <section>
          <Entete
            titre="L’agenda de la semaine"
            sous={`${semaine.length} rendez-vous d’ici dimanche`}
            lien={{ href: '/?mode=agenda', label: 'Tout l’agenda', vue: 'carte' }}
          />
          {categories.length > 1 && (
            <div className="pcv-chips">
              <button type="button" className={`pcv-pill${catActive === null ? ' pcv-pillOn' : ''}`}
                      onClick={() => setCatActive(null)}>Tout</button>
              {categories.map(c => (
                <button key={c} type="button"
                        className={`pcv-pill${catActive === c ? ' pcv-pillOn' : ''}`}
                        onClick={() => setCatActive(catActive === c ? null : c)}>
                  {/* Le libellé, pas la valeur brute : la base stocke
                      « sante_bien_etre », personne ne lit ça. */}
                  {CATEGORIES[c as Categorie]?.label ?? c}
                </button>
              ))}
            </div>
          )}
          <div className="pcv-g3">
            {semaineFiltree.map(e => <TuileEvenement key={e.id} ev={e} />)}
          </div>
        </section>
      )}
    </div>
  )
}
