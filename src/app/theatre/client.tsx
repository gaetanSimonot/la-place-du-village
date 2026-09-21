'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { useTerritoire } from '@/components/TerritoireProvider'
import {
  dureeLisible, heureLisible,
  type Theatre, type Spectacle, type Representation,
} from '@/lib/theatre'

/**
 * UNIVERS THÉÂTRE — public, sans compte.
 *
 * C'est le MÊME module que le cinéma, avec des spectacles à la place des
 * films : même barre de sortie, même enseigne, même sélecteur de salle, mêmes
 * trois onglets soulignés, mêmes espacements. Rien n'est réinventé ici — le
 * châssis (panneau bureau, voile, rouleau d'affiches, pastilles) est partagé,
 * et seules les dix couleurs de `[data-univers='theatre']` changent. Le rouge
 * du rideau au lieu du bleu nuit, bottom nav et barre du haut comprises.
 *
 * Ce que le métier change, et lui seul :
 *
 * — À L'AFFICHE, ce sont TOUS les spectacles de la saison. Un cinéma tourne
 *   ses films en trois semaines ; une salle de village annonce sa saison en
 *   juin pour l'année entière. Couper à quelques semaines masquerait les
 *   trois quarts de l'affiche.
 * — LE PROGRAMME se parcourt par MOIS, pas par jour. Sept mois de saison ne
 *   tiennent pas dans un bandeau de sept pastilles, et une salle qui joue
 *   dix fois l'an n'a pas de « journée ».
 * — Le passé reste DANS le programme : une saison se regarde en entier.
 */

interface Evenement {
  id: string; titre: string; date_debut: string
  heure: string | null; image_url: string | null
  categorie: string | null
  /** Sous-libellé libre — « rencontre », « ouverture de saison ». */
  categorie_libre: string | null
  lieu: { nom: string | null; adresse: string | null; commune: string | null } | null
}

interface Payload {
  /** Toutes les salles du territoire. Plusieurs → sélecteur. */
  theatres: Theatre[]
  /** La salle demandée par `?theatre=`. `null` = on les regarde toutes. */
  theatre: Theatre | null
  spectacles: Spectacle[]
  representations: Representation[]
  passees: Representation[]
  evenements: Evenement[]
  aujourdhui: string
}

type Onglet = 'spectacles' | 'programme' | 'evenements'
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'spectacles', label: 'Spectacles' },
  { id: 'programme',  label: 'Programme' },
  { id: 'evenements', label: 'Événements' },
]

const fetcher = (u: string) => fetch(u).then(r => r.json())

/**
 * L'enseigne de chaque salle, par son identifiant de lien.
 *
 * Une salle sans logo n'est pas un problème : son nom s'affiche en grand à la
 * place. Ajouter une enseigne, c'est déposer un fichier dans public/theatre/
 * et l'inscrire ici — rien d'autre. Même mécanique qu'au cinéma.
 */
const LOGOS: Record<string, string> = {}
const logoDeLaSalle = (slug: string | null | undefined): string | null =>
  (slug && LOGOS[slug]) || null

/**
 * Le nom d'une salle, coupé en enseigne.
 *
 * Les affiches de l'Albarède écrivent « Albarède » en grand et « Théâtre »
 * en petit au-dessus — le mot générique ne porte pas l'identité, le nom
 * propre si. On applique la même coupe à toute salle dont le nom commence
 * par son type : « Théâtre du Vigan » donnera « du Vigan » sous « Théâtre ».
 *
 * Une salle nommée autrement garde son nom entier : on ne coupe que ce qu'on
 * reconnaît, et seulement si ce qui reste tient en deux mots. Sans cette
 * réserve, « Salle des fêtes Tèrra-Còr » s'afficherait « des fêtes Tèrra-Còr »
 * sous un « SALLE » solitaire : le nom propre n'est pas ce qui suit le type,
 * c'est ce qui tient debout tout seul.
 */
const TYPES_DE_SALLE = /^(théâtre|theatre|salle|espace|centre culturel|scène nationale)\s+/i

function enseigne(nom: string): { type: string | null; mot: string } {
  const m = nom.match(TYPES_DE_SALLE)
  if (!m) return { type: null, mot: nom }
  const reste = nom.slice(m[0].length).trim()
  if (!reste || reste.split(/\s+/).length > 2) return { type: null, mot: nom }
  return { type: m[1], mot: reste }
}

function jourLong(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function jourCourt(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  return {
    nom: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d).replace('.', ''),
    num: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric' }).format(d),
  }
}
/** « 2026-12 » → « déc ». */
function moisCourt(mois: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'short' })
    .format(new Date(`${mois}-15T12:00:00Z`)).replace('.', '')
}

/** Visuel 3:4, avec repli typographique quand il n'est pas renseigné. */
function Visuel({ spectacle, largeur }: { spectacle: Spectacle; largeur: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden"
      style={{
        width: largeur, aspectRatio: '3 / 4', borderRadius: 10,
        background: 'var(--uni-vide)',
        border: '1px solid var(--uni-line)',
      }}>
      {spectacle.affiche_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spectacle.affiche_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute bottom-2 left-2 right-2 line-clamp-3"
          style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, color: 'var(--uni-videInk)' }}>
          {spectacle.titre}
        </span>
      )}
    </div>
  )
}

export default function TheatreClient() {
  const router = useRouter()
  const [slug, setSlug] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<Onglet>('spectacles')
  /**
   * Le mois regardé. TROIS états et non deux, et c'est ce qui manquait :
   * `null` = on n'a pas encore choisi, et l'effet plus bas pose le mois
   * courant ; `'tout'` = toute la saison, DEMANDÉE. Avec deux états,
   * « Voir toute la saison » remettait `null` et l'effet le rattrapait
   * aussitôt sur le mois courant : le bouton basculait sur lui-même.
   */
  const [mois, setMois] = useState<string | null>(null)

  // Lecture directe de l'URL : useSearchParams() ferait basculer la page en
  // rendu client complet (piège documenté sur ce projet).
  useEffect(() => {
    try { setSlug(new URLSearchParams(window.location.search).get('theatre')) } catch { /* noop */ }
  }, [])

  // Le thème vit tant qu'on est sur cette page, et pas une seconde de plus.
  useEffect(() => {
    document.documentElement.dataset.univers = 'theatre'
    return () => { delete document.documentElement.dataset.univers }
  }, [])

  // La ville fait partie de la clé : sans le paramètre, la route sert le
  // territoire par défaut, et le cache SWR servirait la réponse de l'un à
  // l'autre. Même piège qu'au cinéma, même parade.
  const { territoire } = useTerritoire()
  const qTerr = territoire?.slug ? `territoire=${encodeURIComponent(territoire.slug)}` : ''
  const qSalle = slug ? `theatre=${encodeURIComponent(slug)}` : ''
  const requete = [qSalle, qTerr].filter(Boolean).join('&')

  const { data, isLoading } = useSWR<Payload>(
    `/api/theatre${requete ? `?${requete}` : ''}`, fetcher,
  )

  const theatre = data?.theatre ?? null
  const salles = useMemo(() => data?.theatres ?? [], [data])
  const salleUnique = theatre ?? (salles.length === 1 ? salles[0] : null)
  const nomsSalles = useMemo(() => new Map(salles.map(t => [t.id, t.nom])), [salles])
  const parId = useMemo(() => new Map((data?.spectacles ?? []).map(s => [s.id, s])), [data])
  const aujourdhui = data?.aujourdhui ?? ''
  const passees = useMemo(() => data?.passees ?? [], [data])
  const aVenir = useMemo(() => data?.representations ?? [], [data])

  /**
   * Toute la saison, dans l'ordre : ce qui a été joué puis ce qui vient. Les
   * passées arrivent en ordre décroissant de la route — on les remet à
   * l'endroit, sans quoi le programme commencerait par la fin.
   */
  const saison = useMemo(() => [...[...passees].reverse(), ...aVenir], [passees, aVenir])

  /**
   * L'AFFICHE, c'est toute la saison — un spectacle, UNE fois, dans l'ordre de
   * sa prochaine date. Deux représentations ne font pas deux vignettes : la
   * fiche est celle de l'œuvre, ses dates se lisent dedans. Ceux qui sont
   * déjà joués ferment la marche : ils restent consultables, mais ils ne sont
   * plus ce qu'on va voir.
   */
  const spectaclesAffiche = useMemo(() => {
    const vus = new Set<string>(); const out: Spectacle[] = []
    for (const r of [...aVenir, ...passees]) {
      if (vus.has(r.spectacle_id)) continue
      const s = parId.get(r.spectacle_id)
      if (s) { vus.add(r.spectacle_id); out.push(s) }
    }
    return out
  }, [aVenir, passees, parId])

  /** Les six prochaines dates : « prochainement », sous l'affiche. */
  const prochainement = useMemo(() => aVenir.slice(0, 6), [aVenir])

  /** Les mois de la saison, pour le bandeau de l'onglet Programme. */
  const moisSaison = useMemo(() => {
    const vus = new Set<string>(); const out: string[] = []
    for (const r of saison) {
      const k = r.date.slice(0, 7)
      if (!vus.has(k)) { vus.add(k); out.push(k) }
    }
    return out
  }, [saison])

  /** Programmation groupée par jour, selon le mois retenu. */
  const parJour = useMemo(() => {
    const source = mois && mois !== 'tout'
      ? saison.filter(r => r.date.slice(0, 7) === mois)
      : saison
    const m = new Map<string, Representation[]>()
    for (const r of source) { const l = m.get(r.date) ?? []; l.push(r); m.set(r.date, l) }
    return Array.from(m.entries())
  }, [saison, mois])

  // Ouvrir le programme sur le mois courant plutôt qu'en septembre : on
  // cherche ce qui se joue maintenant, pas le début de la saison. Ne se
  // joue QU'UNE FOIS : 'tout' est un choix, pas une absence de choix.
  useEffect(() => {
    if (mois !== null || !aujourdhui || moisSaison.length === 0) return
    const k = aujourdhui.slice(0, 7)
    setMois(moisSaison.includes(k)
      ? k
      : moisSaison.find(m => m >= k) ?? moisSaison[moisSaison.length - 1])
  }, [aujourdhui, moisSaison, mois])

  const billetterie = salleUnique?.billetterie_url ?? null
  const enseignes = useMemo(() => (salleUnique ? [salleUnique] : []), [salleUnique])
  const communes = useMemo(
    () => (salleUnique && salleUnique.commune ? [salleUnique.commune] : []),
    [salleUnique])

  /** Changer de salle. L'URL suit, donc le lien reste partageable. */
  function choisirSalle(cle: string | null) {
    setSlug(cle)
    setMois(null)
    try {
      window.history.replaceState(null, '', cle ? `/theatre?theatre=${encodeURIComponent(cle)}` : '/theatre')
    } catch { /* noop */ }
  }

  return (
    <div className="pcv-cine relative min-h-[100dvh] font-inter"
      style={{ background: 'var(--uni-bg)', color: 'var(--uni-ink)', paddingBottom: 92 }}>

      {/* Barre de sortie — la porte de retour vers l'app */}
      <div className="flex items-center gap-2.5 px-3.5"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))', paddingBottom: 6 }}>
        <button
          onClick={() => router.push('/?tab=village')}
          aria-label="Revenir à La Place du Village"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
          style={{ border: '1px solid var(--uni-line)', background: 'var(--uni-creux)', color: 'var(--uni-ink)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={() => router.push('/?tab=village')}
          className="min-w-0 truncate border-none bg-transparent p-0 text-left"
          style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>
          La Place du Village
        </button>
        {communes.length > 0 && (
          <span className="ml-auto flex-none truncate"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--uni-dim)' }}>
            {communes.join(' · ')}
          </span>
        )}
        {billetterie ? (
          <a href={billetterie} target="_blank" rel="noopener noreferrer"
            className="flex-none rounded-full no-underline"
            style={{ marginLeft: communes.length ? 12 : 'auto', border: '1px solid var(--uni-accent)', padding: '7px 13px', fontSize: 12, fontWeight: 700, color: 'var(--uni-accent)' }}>
            Billetterie
          </a>
        ) : salleUnique ? (
          // Une salle sans billetterie en ligne : on le dit plutôt que de
          // laisser un vide, et surtout plutôt que d'envoyer ailleurs.
          <span className="ml-auto flex-none rounded-full"
            style={{ border: '1px solid var(--uni-line)', padding: '7px 13px', fontSize: 11.5, fontWeight: 600, color: 'var(--uni-dim)' }}>
            Billetterie bientôt
          </span>
        ) : null}
      </div>

      {/* Enseigne. Sans logo connu, c'est le nom qui porte l'identité — et
          ajouter une salle ne demande qu'un fichier de plus. En agrégé, un
          titre commun : la page ne parle alors d'aucune salle en particulier. */}
      <div style={{ padding: '16px 26px 22px' }}>
        <div className="flex flex-wrap items-center justify-center" style={{ gap: 0 }}>
          {enseignes.map(salle => (
            <span key={salle.id} className="flex flex-none items-center justify-center"
              style={{ width: 290, minHeight: 100 }}>
              {logoDeLaSalle(salle.slug) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDeLaSalle(salle.slug)!} alt={salle.nom}
                  style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
              ) : (
                /* L'ENSEIGNE, composée comme la couverture du programme : le
                   nom propre en gros, en rose et en Montserrat ExtraBold —
                   la police que le théâtre emploie lui-même, lue dans les
                   polices embarquées de son PDF. Le mot générique passe
                   au-dessus, en petit : c'est l'ordre de leurs affiches.

                   Le rose est celui de la couverture descendu d'un cran
                   (#C85A96 au lieu de #D16DA3) : l'original ne tient que
                   2,6 de contraste sur le béton clair, sous le seuil même
                   pour un grand titre. La teinte ne bouge pas. */
                <span className="text-center">
                  {enseigne(salle.nom).type && (
                    <span className="block font-montserrat"
                      style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--uni-dim2)' }}>
                      {enseigne(salle.nom).type}
                    </span>
                  )}
                  <span className="block font-montserrat"
                    style={{ marginTop: 2, fontSize: 38, lineHeight: 1.02, fontWeight: 800, letterSpacing: '-.035em', color: '#C85A96' }}>
                    {enseigne(salle.nom).mot}
                  </span>
                  {salle.commune && (
                    <span className="block font-montserrat"
                      style={{ marginTop: 5, fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--uni-dim2)' }}>
                      {salle.commune}
                    </span>
                  )}
                </span>
              )}
            </span>
          ))}
          {enseignes.length === 0 && (
            <h1 className="m-0 font-montserrat"
              style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', color: '#C85A96' }}>
              Au théâtre
            </h1>
          )}
        </div>

        {!salleUnique && salles.length > 1 && (
          <p className="m-0 text-center" style={{ marginTop: 14, fontSize: 12, color: 'var(--uni-dim2)' }}>
            {salles.length} salles autour de vous
          </p>
        )}
      </div>

      {/* Choisir sa salle — n'apparaît qu'à partir de la deuxième, et passe à
          la ligne plutôt que de défiler : en défilement centré, la première
          pastille sort de l'écran par la gauche et devient inatteignable. */}
      {salles.length > 1 && (
        <div className="flex flex-wrap justify-center px-4 pb-4" style={{ gap: 8, rowGap: 8 }}>
          {[{ id: 'tous', nom: 'Tous', cle: null as string | null }, ...salles.map(t => ({
            id: t.id, nom: t.nom, cle: t.slug ?? t.id,
          }))].map(o => {
            const actif = o.cle === null ? !theatre : theatre?.id === o.id
            return (
              <button key={o.id} onClick={() => choisirSalle(o.cle)} className="flex-none"
                style={{
                  maxWidth: 'min(15rem, 46vw)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  borderRadius: 999, padding: '7px 13px', fontSize: 12,
                  fontWeight: actif ? 700 : 600,
                  border: `1px solid ${actif ? 'var(--uni-accent)' : 'var(--uni-trait2)'}`,
                  background: actif ? 'var(--uni-tint2)' : 'transparent',
                  color: actif ? 'var(--uni-accent2)' : 'var(--uni-dim)',
                }}>
                {o.nom}
              </button>
            )
          })}
        </div>
      )}

      {/* Onglets centrés */}
      <div className="flex justify-center gap-7 px-4" style={{ borderBottom: '1px solid var(--uni-line)' }}>
        {ONGLETS.map(o => {
          const actif = o.id === onglet
          return (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              className="flex-none whitespace-nowrap bg-transparent"
              style={{
                border: 'none', borderBottom: `2px solid ${actif ? 'var(--uni-accent)' : 'transparent'}`,
                padding: '11px 0 10px', fontSize: 13.5,
                fontWeight: actif ? 700 : 600,
                color: actif ? 'var(--uni-accent2)' : 'var(--uni-dim)',
              }}>
              {o.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full"
            style={{ border: '3px solid var(--uni-tint2)', borderTopColor: 'var(--uni-accent)' }} />
        </div>
      ) : !salles.length ? (
        <Vide texte="Aucun théâtre n’a encore rejoint La Place du Village." />
      ) : onglet === 'spectacles' ? (
        <>
          <Titre texte="À l'affiche" compteur={spectaclesAffiche.length} />
          {spectaclesAffiche.length === 0 ? (
            <Vide texte="La saison n’est pas encore publiée." />
          ) : (
            /* Sur téléphone, un rouleau qu'on pousse au pouce. Sur ordinateur,
               la même ligne défile toute seule en boucle : la liste est écrite
               DEUX fois, la copie prenant le relais quand l'originale sort du
               cadre. La copie est masquée sous 1024 px (`pcv-cineDup`) — le
               téléphone ne voit jamais les visuels en double. Rouages communs
               au cinéma et au carrousel des partenaires du Village. */
            <div className="pcv-cineCarrousel" style={{ ['--pcv-n' as string]: spectaclesAffiche.length }}>
            <div className="pcv-cinePiste flex gap-3 overflow-x-auto px-[18px] pb-1.5" style={{ scrollbarWidth: 'none' }}>
              {[...spectaclesAffiche, ...spectaclesAffiche].map((s, i) => {
                const copie = i >= spectaclesAffiche.length
                return (
                  <Link key={`${s.id}-${i}`} href={`/theatre/spectacle/${s.id}`}
                    className={`pcv-cineAff w-[118px] flex-none no-underline${copie ? ' pcv-cineDup' : ''}`}
                    aria-hidden={copie} tabIndex={copie ? -1 : undefined}>
                    <Visuel spectacle={s} largeur={118} />
                    <div className="line-clamp-2"
                      style={{ marginTop: 9, fontSize: 13, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>
                      {s.titre}
                    </div>
                    {/* La compagnie plutôt que la durée : au théâtre, c'est
                        elle qui dit de quoi il s'agit. */}
                    {(s.compagnie || dureeLisible(s.duree_min)) && (
                      <div className="truncate" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--uni-dim2)' }}>
                        {s.compagnie || dureeLisible(s.duree_min)}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
            </div>
          )}

          {prochainement.length > 0 && (
            <>
              <Titre texte="Prochainement" compteur={prochainement.length} />
              <ListeDates liste={prochainement} spectacles={parId} billetterie={billetterie}
                salles={salleUnique ? null : nomsSalles} avecJour />
              {/* La suite est dans l'onglet d'à côté : sans cette porte, on
                  voyait six dates et on croyait que c'était tout. */}
              <button onClick={() => setOnglet('programme')}
                className="mx-auto flex items-center gap-2 border-none bg-transparent"
                style={{ marginTop: 14, padding: '10px 18px', borderRadius: 999, border: '1px solid var(--uni-line)', fontSize: 12.5, fontWeight: 700, color: 'var(--uni-accent2)' }}>
                Voir toute la saison
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
                </svg>
              </button>
            </>
          )}
        </>
      ) : onglet === 'programme' ? (
        <>
          {/* Bandeau des mois de la saison, avec le nombre de dates. Le passé
              y est, simplement estompé : une saison se regarde en entier. */}
          <div className="pcv-cineJours flex gap-[7px] overflow-x-auto" style={{ padding: '14px 18px 4px', scrollbarWidth: 'none' }}>
            {/* Une pastille « tout » EN TÊTE du bandeau : le choix reste visible et
                réversible. Un bouton de bas de page qui disparaît une fois pressé
                laissait sans repère — on ne savait plus ce qu'on regardait. */}
            <button onClick={() => setMois('tout')} className="flex-none text-center"
              style={{
                width: 52, borderRadius: 11, padding: '8px 0 9px',
                background: mois === 'tout' ? 'var(--uni-tint2)' : 'var(--uni-creux)',
                border: `1px solid ${mois === 'tout' ? 'var(--uni-accent)' : 'var(--uni-trait)'}`,
                color: mois === 'tout' ? 'var(--uni-accent2)' : 'var(--uni-ink)',
              }}>
              <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: mois === 'tout' ? 'var(--uni-doux)' : 'var(--uni-dim2)' }}>
                tout
              </span>
              <b className="font-title" style={{ display: 'block', fontSize: 17, lineHeight: 1.1, marginTop: 2, fontWeight: 700 }}>{saison.length}</b>
            </button>
            {moisSaison.map(m => {
              const actif = mois === m
              const passe = aujourdhui ? m < aujourdhui.slice(0, 7) : false
              const n = saison.filter(r => r.date.slice(0, 7) === m).length
              return (
                <button key={m} onClick={() => setMois(m)} className="flex-none text-center"
                  style={{
                    width: 52, borderRadius: 11, padding: '8px 0 9px',
                    background: actif ? 'var(--uni-tint2)' : 'var(--uni-creux)',
                    border: `1px solid ${actif ? 'var(--uni-accent)' : 'var(--uni-trait)'}`,
                    color: actif ? 'var(--uni-accent2)' : 'var(--uni-ink)',
                    opacity: passe && !actif ? 0.5 : 1,
                  }}>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: actif ? 'var(--uni-doux)' : 'var(--uni-dim2)' }}>
                    {moisCourt(m)}
                  </span>
                  <b className="font-title" style={{ display: 'block', fontSize: 17, lineHeight: 1.1, marginTop: 2, fontWeight: 700 }}>{n}</b>
                </button>
              )
            })}
          </div>

          {parJour.length === 0 ? (
            <Vide texte={mois === 'tout' ? 'La saison n’est pas encore publiée.' : 'Rien ce mois-là.'} />
          ) : parJour.map(([d, liste]) => {
            const passe = !!aujourdhui && d < aujourdhui
            return (
              <div key={d}>
                <div className="flex items-center justify-between gap-2"
                  style={{ padding: '9px 18px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--uni-accent)', background: 'var(--uni-band)', borderBottom: '1px solid var(--uni-line)', opacity: passe ? 0.62 : 1 }}>
                  <span>{jourLong(d)}</span>
                  <em style={{ fontStyle: 'normal', fontWeight: 700, letterSpacing: '.02em', textTransform: 'none', color: 'var(--uni-dim2)', fontSize: 11 }}>
                    {passe ? 'joué' : `${liste.length} représentation${liste.length > 1 ? 's' : ''}`}
                  </em>
                </div>
                <ListeDates liste={liste} spectacles={parId} billetterie={billetterie}
                  salles={salleUnique ? null : nomsSalles} passe={passe} />
              </div>
            )
          })}

          {mois !== 'tout' && (
            <button onClick={() => setMois('tout')}
              className="block w-full border-none"
              style={{ borderTop: '1px solid var(--uni-line)', background: 'var(--uni-tint)', padding: 13, fontSize: 12.5, fontWeight: 700, color: 'var(--uni-accent)' }}>
              Voir toute la saison
            </button>
          )}
        </>
      ) : (
        <Evenements liste={data?.evenements ?? []} />
      )}

      <BottomNavBar />
    </div>
  )
}

/* ─── Briques ─────────────────────────────────────────────────────────── */

/**
 * Le compteur se tient CONTRE le titre, pas à l'autre bout de la ligne :
 * seul à droite, il flottait sans qu'on sache ce qu'il comptait.
 */
function Titre({ texte, compteur }: { texte: string; compteur?: number }) {
  return (
    <div className="flex items-baseline gap-2" style={{ padding: '18px 18px 10px' }}>
      <h2 className="m-0 font-title" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>{texte}</h2>
      {typeof compteur === 'number' && (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--uni-dim2)' }}>{compteur}</span>
      )}
    </div>
  )
}

function Vide({ texte }: { texte: string }) {
  return <p className="px-[18px] py-10 text-center" style={{ fontSize: 12.5, color: 'var(--uni-dim)' }}>{texte}</p>
}

/**
 * Liste de représentations, bord à bord. Pas d'encadré arrondi : des lignes
 * qui filent d'un bord à l'autre, la colonne d'heure séparée par un filet
 * vertical, pas de séparateur sous la dernière. Exactement la liste de
 * séances du cinéma, avec le LIEU DE JEU en plus — une compagnie peut jouer
 * hors les murs, et il faut le dire.
 *
 * Une séance SCOLAIRE figure au programme mais porte sa mention et n'offre
 * pas de réservation : on ne peut pas y venir, personne ne doit se déplacer
 * pour rien.
 */
function ListeDates({ liste, spectacles, billetterie, salles, avecJour, passe }: {
  liste: Representation[]
  spectacles: Map<string, Spectacle>
  billetterie: string | null
  /** Les noms de salle, quand plusieurs théâtres sont affichés ensemble.
      `null` quand on regarde une seule salle : le répéter n'apprend rien. */
  salles: Map<string, string> | null
  /** Porter la date sur chaque ligne, quand il n'y a pas de bandeau de jour. */
  avecJour?: boolean
  passe?: boolean
}) {
  return (
    <div style={{ opacity: passe ? 0.62 : 1 }}>
      {liste.map((r, i) => {
        const s = spectacles.get(r.spectacle_id)
        const lien = r.billetterie_url || billetterie
        const j = jourCourt(r.date)
        return (
          <div key={r.id} className="flex items-center gap-[13px]"
            style={{ padding: '11px 18px', borderBottom: i === liste.length - 1 ? 'none' : '1px solid var(--uni-trait)' }}>
            <span className="flex-none font-title tabular-nums"
              style={{ width: avecJour ? 62 : 50, paddingRight: 13, borderRight: '1px solid var(--uni-trait2)', fontSize: avecJour ? 12.5 : 15, fontWeight: 800, color: 'var(--uni-accent2)', lineHeight: 1.25 }}>
              {avecJour ? (
                <>
                  {`${j.nom} ${j.num}`}
                  {heureLisible(r.heure) && (
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--uni-dim2)' }}>
                      {heureLisible(r.heure)}
                    </span>
                  )}
                </>
              ) : (heureLisible(r.heure) ?? '—')}
            </span>
            {/* Le visuel en tout petit : on reconnaît un spectacle à son image
                avant de lire son titre. Calé sur la hauteur du texte pour que
                la ligne garde exactement sa taille. */}
            <span className="flex-none overflow-hidden"
              style={{ width: 26, height: 34, borderRadius: 4, background: 'var(--uni-tint)', border: '1px solid var(--uni-line)' }}>
              {s?.affiche_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.affiche_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/theatre/spectacle/${r.spectacle_id}`} className="block truncate no-underline"
                style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>
                {s?.titre ?? 'Spectacle'}
              </Link>
              <div className="truncate" style={{ marginTop: 2, fontSize: 11, color: 'var(--uni-dim2)' }}>
                {[
                  r.lieu ?? salles?.get(r.etablissement_id) ?? null,
                  s?.genre ?? null,
                  dureeLisible(s?.duree_min),
                  r.note,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            {r.scolaire ? (
              <span className="flex-none"
                style={{ border: '1px solid var(--uni-line)', borderRadius: 7, padding: '5px 9px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--uni-dim2)' }}>
                scolaire
              </span>
            ) : passe ? (
              <span className="flex-none" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--uni-dim2)' }}>
                Joué
              </span>
            ) : lien ? (
              <a href={lien} target="_blank" rel="noopener noreferrer" className="flex-none no-underline"
                style={{ border: '1px solid var(--uni-bordA)', borderRadius: 7, padding: '6px 11px', fontSize: 11.5, fontWeight: 700, color: 'var(--uni-accent2)' }}>
                Réserver
              </a>
            ) : (
              <span className="flex-none" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--uni-dim2)' }}>
                Sur place
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Événements de la salle. Ce sont des événements de l'agenda du village, pas
 * des représentations : même modèle de données, et ils apparaissent donc
 * aussi ailleurs dans l'app. Pas de doublon de modèle.
 */
function Evenements({ liste }: { liste: Evenement[] }) {
  const [cat, setCat] = useState<string>('tout')
  const cats = useMemo(() => {
    const s = new Set(liste.map(e => e.categorie_libre || e.categorie).filter(Boolean) as string[])
    return ['tout', ...Array.from(s)]
  }, [liste])
  const filtres = cat === 'tout' ? liste : liste.filter(e => (e.categorie_libre || e.categorie) === cat)
  const [phare, ...suite] = filtres

  if (!liste.length) return <Vide texte="Aucun événement programmé pour l’instant." />

  return (
    <>
      {/* Chips seulement s'il y a de quoi filtrer — un seul choix n'est pas un filtre. */}
      {cats.length > 2 && (
        <div className="flex gap-2 overflow-x-auto" style={{ padding: '14px 18px 0', scrollbarWidth: 'none' }}>
          {cats.map(c => {
            const actif = c === cat
            return (
              <button key={c} onClick={() => setCat(c)} className="flex-none whitespace-nowrap"
                style={{
                  borderRadius: 999, padding: '7px 13px', fontSize: 12,
                  fontWeight: actif ? 700 : 600,
                  border: `1px solid ${actif ? 'var(--uni-accent)' : 'var(--uni-trait2)'}`,
                  background: actif ? 'var(--uni-tint2)' : 'transparent',
                  color: actif ? 'var(--uni-accent2)' : 'var(--uni-dim)',
                }}>
                {c === 'tout' ? 'Tout' : c}
              </button>
            )
          })}
        </div>
      )}

      {phare && (
        <Link href={`/evenement/${phare.id}`} className="block no-underline"
          style={{ margin: '14px 18px 0', borderRadius: 16, padding: 18, background: 'linear-gradient(140deg,var(--uni-tint2),var(--uni-tint))', border: '1px solid var(--uni-line)' }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--uni-accent)' }}>
            À ne pas manquer
          </span>
          <h3 className="m-0 font-title" style={{ marginTop: 10, fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: 'var(--uni-ink)' }}>{phare.titre}</h3>
          <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--uni-dim)', lineHeight: 1.5 }}>
            {jourLong(phare.date_debut)}{heureLisible(phare.heure) ? ` · ${heureLisible(phare.heure)}` : ''}
            {phare.lieu?.nom && <><br />{[phare.lieu.nom, phare.lieu.commune].filter(Boolean).join(' · ')}</>}
          </div>
          <span className="inline-flex items-center"
            style={{ marginTop: 14, gap: 7, borderRadius: 9, background: 'var(--uni-accent)', color: 'var(--nav-fab-ink)', padding: '10px 14px', fontSize: 12.5, fontWeight: 800 }}>
            Voir l’événement
          </span>
        </Link>
      )}

      <div className="flex flex-col gap-2.5" style={{ margin: '12px 18px 0' }}>
        {suite.map(e => {
          const { nom, num } = jourCourt(e.date_debut)
          // Le nom du lieu suffit s'il est parlant ; sinon l'adresse prend le
          // relais. Les répéter tous les deux allongerait la carte pour rien.
          const lieu = [e.lieu?.nom, e.lieu?.commune ?? e.lieu?.adresse]
            .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || null
          return (
            <Link key={e.id} href={`/evenement/${e.id}`} className="flex overflow-hidden no-underline"
              style={{ borderRadius: 13, background: 'var(--uni-panel)', border: '1px solid var(--uni-trait)' }}>
              <div className="flex flex-none flex-col items-center justify-center gap-0.5"
                style={{ width: 58, background: 'var(--uni-tint)', borderRight: '1px solid var(--uni-line)' }}>
                <b className="font-title" style={{ fontSize: 20, lineHeight: 1, fontWeight: 700, color: 'var(--uni-accent2)' }}>{num}</b>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--uni-doux)' }}>{nom}</span>
              </div>
              <div className="min-w-0 flex-1" style={{ padding: 12 }}>
                {(e.categorie_libre || e.categorie) && (
                  <span style={{ display: 'inline-block', borderRadius: 4, padding: '2px 7px', fontSize: 9, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', background: 'var(--uni-tint2)', color: 'var(--uni-accent2)' }}>
                    {e.categorie_libre || e.categorie}
                  </span>
                )}
                <div className="truncate" style={{ marginTop: 6, fontSize: 13.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>{e.titre}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--uni-dim2)' }}>
                  {jourLong(e.date_debut)}{heureLisible(e.heure) ? ` · ${heureLisible(e.heure)}` : ''}
                </div>
                {lieu && (
                  <div className="flex items-center gap-1 truncate" style={{ marginTop: 3, fontSize: 11, color: 'var(--uni-dim2)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', opacity: .7 }}>
                      <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>
                    </svg>
                    <span className="truncate">{lieu}</span>
                  </div>
                )}
              </div>
              {/* La photo de l'événement, format carte plutôt qu'affiche : ce
                  n'est pas un spectacle, c'est une soirée. */}
              {e.image_url && (
                <span className="flex-none self-stretch overflow-hidden" style={{ width: 74, borderLeft: '1px solid var(--uni-trait)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </>
  )
}
