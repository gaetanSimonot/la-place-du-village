'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { useTerritoire } from '@/components/TerritoireProvider'
import BottomNavBar from '@/components/BottomNavBar'
import RadioDirect from '@/components/RadioDirect'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import EventEditDrawer from '@/components/EventEditDrawer'
import { useAdminSession } from '@/hooks/useAdminSession'
import { CATEGORIES } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { imageEvenement } from '@/lib/imageEvenement'
import { RADIO, LOGO_ROND, BLEU_RADIO, formatDuree, datesDepuisDetail, type PayloadRadio, type MentionRadio } from '@/lib/radio'
import type { EvenementCard } from '@/lib/types'

const MapView = dynamic(() => import('@/components/MapViewSwitch'), { ssr: false })

/**
 * RADIO ESCAPADES — écouter la sélection, puis y aller.
 *
 * La page fait deux choses, et la seconde est la vraie valeur : un podcast dit
 * « samedi à Sauve » et personne ne retient l'adresse. On donne donc à écouter
 * ET on rend cliquable ce qui a été annoncé.
 *
 * ON RESTE DANS LES COULEURS DE L'APP. Le cinéma bascule en bleu nuit parce
 * qu'une salle est sombre — une émission de radio n'a pas d'équivalent, et
 * inventer un univers brun ne faisait que dépareiller. L'identité du module
 * est portée par le logo de la radio, pas par un fond de couleur.
 *
 * UNE LIGNE QUI NE MÈNE NULLE PART EST NORMALE. L'émission parle de ce qu'elle
 * veut ; une partie de ce qu'elle annonce n'est jamais passée par nos
 * collecteurs. Ces lignes-là s'affichent quand même, en retrait et sans
 * vignette — les retirer donnerait une liste qui ment sur le contenu du
 * podcast.
 */

const fetcher = (u: string) => fetch(u).then(r => r.json())

/** « Semaine du 15 au 21 septembre » à partir du lundi. */
function libelleSemaine(lundi: string): string {
  const d1 = new Date(`${lundi}T12:00:00`)
  const d2 = new Date(d1.getTime() + 6 * 86_400_000)
  const jour = (d: Date) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric' }).format(d)
  const jourMois = (d: Date) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d)
  const mois = (d: Date) => new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(d)
  return mois(d1) === mois(d2)
    ? `Semaine du ${jour(d1)} au ${jourMois(d2)}`
    : `Semaine du ${jourMois(d1)} au ${jourMois(d2)}`
}

/**
 * Une ligne de la sélection.
 *
 * Rattachée : la vignette de l'événement, comme partout ailleurs dans l'app —
 * on reconnaît une affiche avant de lire un titre. Non rattachée : pas de
 * vignette, et un bloc INERTE plutôt qu'un lien mort — un lien qui ne fait
 * rien au toucher est plus déroutant qu'une ligne visiblement calme.
 */
function LigneMention({ m, adminPeutCreer, onCreer }: {
  m: MentionRadio
  /** Un admin voit les creneaux vides comme des fiches a creer. */
  adminPeutCreer?: boolean
  onCreer?: (m: MentionRadio) => void
}) {
  const e = m.evenement
  const cat = e ? CATEGORIES[e.categorie] ?? CATEGORIES.autre : null

  const corps = (
    <>
      {e ? (
        <span className="relative block h-[58px] w-[58px] flex-none overflow-hidden rounded-[12px]"
          style={{ background: cat ? `${cat.color}1F` : '#F0ECE6' }}>
          {/* `imageEvenement` peut ne rien rendre : l'aplat de la categorie
              tient alors la place, plutot qu'une image vide. */}
          {imageEvenement(e) && (
            <Image src={imageEvenement(e)!} alt="" fill sizes="58px" className="object-cover"
              style={{ objectPosition: e.image_url ? (e.image_position ?? '50% 50%') : '50% 50%' }} />
          )}
        </span>
      ) : (
        <span aria-hidden
          className="flex h-[58px] w-[58px] flex-none items-center justify-center rounded-[12px]"
          style={{ border: '1px dashed var(--bord)', color: '#B3A794' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 12h.01" /><path d="M8.5 15.5a5 5 0 0 1 0-7" /><path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </svg>
        </span>
      )}

      <span className="min-w-0 flex-1">
        {cat && (
          <span className="mb-1 inline-block rounded-full px-2 py-[2px]"
            style={{ background: `${cat.color}1A`, color: cat.color, fontSize: 10, fontWeight: 800, letterSpacing: .3 }}>
            {cat.label}
          </span>
        )}
        <span className="block font-title" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--texte)', lineHeight: 1.3 }}>
          {m.titre}
        </span>
        <span className="mt-[3px] block truncate" style={{ fontSize: 12.5, color: 'var(--gris)' }}>
          {e
            ? [e.date_debut ? formatEventDate(e.date_debut, e.date_fin) : null, e.lieux?.nom || e.lieux?.commune]
                .filter(Boolean).join(' · ')
            : m.detail || 'Cité à l’antenne — pas encore dans l’agenda'}
        </span>
        {!e && adminPeutCreer && (
          <span className="mt-1.5 inline-flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}>
            <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Créer la fiche
          </span>
        )}
      </span>

      {e && (
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B3A794"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-5 flex-none">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </>
  )

  const style: React.CSSProperties = {
    background: e ? 'var(--blanc)' : 'transparent',
    border: `1px solid ${e ? 'var(--bord)' : 'transparent'}`,
    borderRadius: 16, padding: 10,
    boxShadow: e ? '0 1px 6px rgba(44,28,16,.05)' : 'none',
  }

  if (e) return <Link href={`/evenement/${e.id}`} className="flex gap-3 no-underline" style={style}>{corps}</Link>

  /*
   * Pas de fiche. Pour un habitant, un bloc INERTE — un lien qui ne fait rien
   * au toucher est plus deroutant qu'une ligne visiblement calme.
   *
   * Pour un admin, c'est au contraire l'endroit le plus naturel pour creer la
   * fiche manquante : c'est ici qu'on lit la selection et qu'on voit le trou.
   * L'obliger a rouvrir l'ecran de saisie pour ca serait un detour.
   */
  if (adminPeutCreer && onCreer) {
    return (
      <button type="button" onClick={() => onCreer(m)}
        className="flex w-full gap-3 text-left"
        style={{ ...style, border: '1px dashed var(--bord)', cursor: 'pointer', background: 'var(--blanc)' }}>
        {corps}
      </button>
    )
  }
  return <div className="flex gap-3" style={style}>{corps}</div>
}

export default function RadioClient() {
  /* La ville regardee voyage avec la requete : la route filtre bien,
     encore faut-il lui dire laquelle. */
  const { territoire: tRadio } = useTerritoire()
  const qTerrRadio = tRadio?.slug ? `?territoire=${encodeURIComponent(tRadio.slug)}` : ''

  const router = useRouter()
  const isAdmin = useAdminSession()
  const { data, isLoading, mutate } = useSWR<PayloadRadio>(`/api/radio${qTerrRadio}`, fetcher)
  const [creerPour, setCreerPour] = useState<MentionRadio | null>(null)
  const [mapProvider, setMapProvider] = useState<'google' | 'maplibre'>('google')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'map_provider').maybeSingle()
      .then(({ data: d }) => setMapProvider(d?.value === 'maplibre' ? 'maplibre' : 'google'))
  }, [])

  const emission = data?.emission ?? null
  // Un tableau neuf à chaque rendu relancerait le useMemo de la carte, et avec
  // lui le calcul de cadrage. On le fige sur la donnée.
  const mentions = useMemo(() => data?.mentions ?? [], [data])

  /** Ce que la carte peut montrer : les fiches rattachées ET localisées. */
  const surLaCarte = useMemo<EvenementCard[]>(
    () => mentions.map(m => m.evenement).filter(
      (e): e is EvenementCard => !!e && e.lieux?.lat != null && e.lieux?.lng != null),
    [mentions],
  )

  /* Le centre : le milieu de ce qui est cité, pas le centre de la zone. Une
     sélection tournée vers Sauve doit ouvrir sur Sauve. */
  const vue = useMemo(() => {
    if (!surLaCarte.length) return null
    const lats = surLaCarte.map(e => e.lieux!.lat as number)
    const lngs = surLaCarte.map(e => e.lieux!.lng as number)
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      zoom: surLaCarte.length === 1 ? 13 : 10.5,
    }
  }, [surLaCarte])

  /*
   * La fiche cree, on la rattache a la mention.
   *
   * L'ecriture passe par la route admin, gardee cote serveur : cette page est
   * publique, et un bouton visible ne prouve rien.
   */
  async function rattacher(mentionId: string, evenementId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/radio/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ type: 'mention', id: mentionId, evenement_id: evenementId }),
    }).catch(() => null)
    if (!res?.ok) { toast.error('Fiche créée, mais le rattachement a échoué'); return }
    toast.success('Fiche créée et rattachée')
    await mutate()
  }

  const sansAdresse = mentions.length - surLaCarte.length

  return (
    <div className="relative min-h-[100dvh]" style={{ background: 'var(--creme)', color: 'var(--texte)', paddingBottom: 96 }}>

      {/* Barre de sortie — la porte de retour vers l'app */}
      <div className="flex items-center gap-2.5 px-4"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))', paddingBottom: 4 }}>
        <button
          onClick={() => router.push('/?tab=village')}
          aria-label="Revenir à La Place du Village"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
          style={{ border: '1px solid var(--bord)', background: 'var(--blanc)', color: 'var(--texte)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={() => router.push('/?tab=village')}
          className="min-w-0 truncate border-none bg-transparent p-0 text-left"
          style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--gris)' }}>
          La Place du Village
        </button>
        <a href={RADIO.site} target="_blank" rel="noopener noreferrer"
          className="ml-auto flex flex-none items-center gap-2 rounded-full no-underline"
          style={{ border: '1px solid var(--bord)', background: 'var(--blanc)', padding: '5px 12px 5px 5px', fontSize: 12, fontWeight: 700, color: BLEU_RADIO }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_ROND} alt="" width={24} height={24}
            style={{ width: 24, height: 24, borderRadius: '50%', display: 'block', background: BLEU_RADIO }} />
          {RADIO.nom} ↗
        </a>
      </div>

      {/* Titre de rubrique — même gabarit que « Aujourd'hui » sur la page Village */}
      <div className="px-4 pb-1 pt-[18px]">
        <h1 className="m-0 font-serif" style={{ fontSize: 26, lineHeight: 1.12, letterSpacing: '-.02em' }}>
          <span style={{ color: 'var(--primary)' }}>La sélection</span><br />
          <span style={{ color: 'var(--accent)' }}>culturelle de la semaine</span>
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--gris)', margin: '7px 0 0', lineHeight: 1.45 }}>
          Ce que {RADIO.nom} a retenu — et où y aller.
        </p>
      </div>

      {/* Le direct d'abord : c'est ce qu'on peut faire MAINTENANT, et ca ne
          demande qu'un geste. La selection de la semaine vient apres. */}
      <RadioDirect />

      {isAdmin && (
        /* La saisie se fait DEPUIS le module : c'est ici qu'on voit le
           résultat, donc ici qu'on doit pouvoir le corriger. */
        <div className="px-4 pt-3">
          <Link href="/radio/admin" className="inline-flex items-center gap-1.5 rounded-full no-underline"
            style={{ border: '1px dashed var(--bord)', background: 'var(--blanc)', padding: '7px 13px', color: 'var(--primary)', fontSize: 12.5, fontWeight: 700 }}>
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            {emission ? 'Modifier cette émission' : 'Monter l’émission de la semaine'}
          </Link>
        </div>
      )}

      {/* ── L'émission ─────────────────────────────────────────────── */}
      <div className="px-4 pt-4">
        {isLoading && (
          <div className="rounded-[18px]" style={{ border: '1px solid var(--bord)', background: 'var(--blanc)', padding: 18, color: 'var(--gris)', fontSize: 13.5 }}>
            Chargement…
          </div>
        )}

        {!isLoading && !emission && (
          /* Une page de module dit d'elle-même quand elle est vide. */
          <div className="rounded-[18px]" style={{ border: '1px solid var(--bord)', background: 'var(--blanc)', padding: 18 }}>
            <div className="font-title" style={{ fontSize: 15.5, fontWeight: 800 }}>Pas encore d’émission</div>
            <p style={{ fontSize: 13.5, color: 'var(--gris)', margin: '6px 0 0', lineHeight: 1.5 }}>
              La sélection de la semaine n’est pas encore montée. Revenez d’ici
              quelques jours, ou écoutez directement sur {RADIO.nom}.
            </p>
          </div>
        )}

        {emission && (
          <div className="overflow-hidden rounded-[18px]"
            style={{ background: 'var(--blanc)', border: '1px solid var(--bord)', boxShadow: '0 2px 12px rgba(44,28,16,.07)' }}>
            {emission.image_url && (
              <div className="relative h-36 w-full" style={{ background: '#F0ECE6' }}>
                <Image src={emission.image_url} alt="" fill sizes="100vw" className="object-cover" />
              </div>
            )}
            <div style={{ padding: 15 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)' }}>
                {libelleSemaine(emission.semaine_debut)}
              </div>
              <div className="font-title" style={{ fontSize: 18.5, fontWeight: 800, letterSpacing: '-.015em', margin: '5px 0 0', lineHeight: 1.25 }}>
                {emission.titre}
              </div>
              {emission.description && (
                <p style={{ fontSize: 13.5, color: 'var(--gris)', margin: '7px 0 0', lineHeight: 1.5 }}>{emission.description}</p>
              )}

              {/*
                Le lecteur natif : il sait déjà mettre en pause, reprendre, se
                déplacer, et il survit au verrouillage de l'écran. Un lecteur
                maison reperdrait tout ça.

                La source passe par NOTRE domaine : le serveur de la radio ne
                renvoie pas d'en-tête CORS, et le navigateur refusait de lire
                le fichier directement.
              */}
              <audio controls preload="none" src={`/api/radio/audio/${emission.id}`}
                className="mt-3 w-full" style={{ height: 40 }}>
                <a href={emission.audio_url}>Écouter l’émission</a>
              </audio>

              {formatDuree(emission.duree_s) && (
                <div style={{ fontSize: 12, color: 'var(--gris)', marginTop: 6 }}>{formatDuree(emission.duree_s)} d’écoute</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Ce que l'émission annonce ──────────────────────────────── */}
      {emission && mentions.length > 0 && (
        <div className="pt-7">
          <div className="flex items-baseline justify-between gap-2.5 px-4 pb-2.5">
            <h2 className="m-0 font-serif" style={{ fontSize: 20, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Les rendez-vous cités
            </h2>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gris)' }}>{mentions.length}</span>
          </div>
          <div className="flex flex-col gap-2 px-4">
            {mentions.map(m => (
              <LigneMention key={m.id} m={m} adminPeutCreer={isAdmin} onCreer={setCreerPour} />
            ))}
          </div>
        </div>
      )}

      {/* ── La carte de la sélection ───────────────────────────────── */}
      {surLaCarte.length > 0 && (
        <div className="pt-7">
          <div className="flex items-baseline justify-between gap-2.5 px-4 pb-2.5">
            <h2 className="m-0 font-serif" style={{ fontSize: 20, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Où ça se passe
            </h2>
          </div>
          <div className="px-4">
            <div className="overflow-hidden rounded-[18px]"
              style={{ border: '1px solid var(--bord)', height: 320, position: 'relative', boxShadow: '0 2px 12px rgba(44,28,16,.07)' }}>
              {/* La MÊME carte que l'accueil, nourrie d'une liste réduite :
                  `evenements` est une prop pure, le composant ne va rien
                  chercher tout seul. Rien n'est réécrit ici. */}
              <MapView
                provider={mapProvider}
                evenements={surLaCarte}
                selectedId={selectedId}
                onSelectEvent={setSelectedId}
                onDeselect={() => setSelectedId(null)}
                onOpenEvent={(id: string) => router.push(`/evenement/${id}`)}
                restaurerVue={vue}
              />
            </div>
            {sansAdresse > 0 && (
              <p style={{ fontSize: 12, color: 'var(--gris)', margin: '8px 0 0' }}>
                {sansAdresse} rendez-vous cité{sansAdresse > 1 ? 's' : ''} n’{sansAdresse > 1 ? 'ont' : 'a'} pas
                d’adresse connue et n’apparaî{sansAdresse > 1 ? 'ssent' : 't'} pas sur la carte.
              </p>
            )}
          </div>
        </div>
      )}

      {creerPour && (
        /* L'editeur de l'app, sans evenementId donc en creation, prerempli de
           ce qu'on SAIT : le titre entendu, et ce que l'animateur a dit du
           jour et du lieu. La date et l'adresse restent a confirmer — les
           deviner d'une phrase parlee produirait des fiches fausses. */
        <EventEditDrawer
          initialData={{
            titre: creerPour.titre,
            description: creerPour.detail ? `Annoncé à l’antenne : ${creerPour.detail}` : '',
            /* La date et l'heure sont LUES dans ce que l'animateur a dit, pas
               devinees : rien n'est propose si la phrase ne les porte pas. */
            ...(() => {
              const d = datesDepuisDetail(creerPour.detail, emission?.semaine_debut ?? '')
              return {
                ...(d.date_debut ? { date_debut: d.date_debut } : {}),
                ...(d.date_fin ? { date_fin: d.date_fin } : {}),
                ...(d.heure ? { heure: d.heure } : {}),
              }
            })(),
          }}
          onClose={() => setCreerPour(null)}
          onSaved={async (r) => {
            const mention = creerPour
            setCreerPour(null)
            if (mention && r?.id) await rattacher(mention.id, r.id)
            else await mutate()
          }}
        />
      )}
      <BottomNavBar />
    </div>
  )
}
