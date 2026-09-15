'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { supabase } from '@/lib/supabase'
import { useAdminSession } from '@/hooks/useAdminSession'
import { CATEGORIES } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { RADIO, formatDuree, type PayloadRadio, type MentionRadio } from '@/lib/radio'
import type { EvenementCard } from '@/lib/types'

const MapView = dynamic(() => import('@/components/MapViewSwitch'), { ssr: false })

/**
 * RADIO ESCAPADES — écouter la sélection, puis y aller.
 *
 * La page fait deux choses, et la seconde est la vraie valeur : un podcast dit
 * « samedi à Sauve » et personne ne retient l'adresse. On donne donc à écouter
 * ET on rend cliquable ce qui a été annoncé.
 *
 * UNE LIGNE QUI NE MÈNE NULLE PART EST NORMALE. L'émission parle de ce qu'elle
 * veut ; une partie de ce qu'elle annonce n'est jamais passée par nos
 * collecteurs. Ces lignes-là s'affichent quand même, en retrait et sans flèche
 * — les retirer donnerait une liste qui ment sur le contenu de l'émission.
 *
 * La page reste publique, comme /cinema : c'est le bloc sur la page Village
 * qui s'ouvre et se ferme, jamais une adresse. Une page de module dit
 * d'elle-même quand elle est vide.
 */

const fetcher = (u: string) => fetch(u).then(r => r.json())

/* Palette de l'univers — chaude, façon cadran de poste. Volontairement loin du
   bleu nuit du cinéma : deux modules ne doivent pas se confondre. */
const BG = '#17120E'
const INK = '#F6EFE6'
const ACCENT = '#E8913C'
const LINE = 'rgba(246,239,230,.14)'
const DIM = '#A5917C'

/** Le libellé « Semaine du 15 au 21 septembre » à partir du lundi. */
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

/** Une ligne de la sélection. Cliquable seulement si la fiche existe chez nous. */
function LigneMention({ m }: { m: MentionRadio }) {
  const e = m.evenement
  const couleur = e ? (CATEGORIES[e.categorie]?.color ?? DIM) : DIM

  const corps = (
    <>
      <span aria-hidden className="mt-[7px] h-2 w-2 flex-none rounded-full"
        style={{ background: e ? couleur : 'transparent', border: e ? 'none' : `1.5px solid ${DIM}` }} />
      <span className="min-w-0 flex-1">
        <span className="block" style={{ fontSize: 14.5, fontWeight: 600, color: e ? INK : DIM, lineHeight: 1.35 }}>
          {m.titre}
        </span>
        <span className="mt-0.5 block truncate" style={{ fontSize: 12.5, color: DIM }}>
          {e
            ? [e.date_debut ? formatEventDate(e.date_debut, e.date_fin) : null, e.lieux?.nom || e.lieux?.commune]
                .filter(Boolean).join(' · ')
            : m.detail || 'Cité à l’antenne — pas encore dans l’agenda'}
        </span>
      </span>
      {e && (
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DIM}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1.5 flex-none">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </>
  )

  const style = { borderBottom: `1px solid ${LINE}`, padding: '13px 2px' }

  // Pas de fiche : on rend un bloc INERTE, pas un lien mort. Un lien qui ne
  // fait rien au toucher est plus déroutant qu'une ligne visiblement calme.
  return e
    ? <Link href={`/evenement/${e.id}`} className="flex gap-3 no-underline" style={style}>{corps}</Link>
    : <div className="flex gap-3" style={style}>{corps}</div>
}

export default function RadioClient() {
  const router = useRouter()
  const isAdmin = useAdminSession()
  const { data, isLoading } = useSWR<PayloadRadio>('/api/radio', fetcher)
  const [mapProvider, setMapProvider] = useState<'google' | 'maplibre'>('google')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'map_provider').maybeSingle()
      .then(({ data: d }) => setMapProvider(d?.value === 'maplibre' ? 'maplibre' : 'google'))
  }, [])

  const emission = data?.emission ?? null
  const mentions = data?.mentions ?? []

  /** Ce que la carte peut montrer : les fiches rattachées ET localisées. */
  const surLaCarte = useMemo<EvenementCard[]>(
    () => mentions.map(m => m.evenement).filter(
      (e): e is EvenementCard => !!e && e.lieux?.lat != null && e.lieux?.lng != null),
    [mentions],
  )

  /*
   * Le centre de la carte : le milieu de ce qui est cité, pas le centre de la
   * zone. Une sélection tournée vers Sauve doit ouvrir sur Sauve.
   */
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

  return (
    <div className="relative min-h-[100dvh] font-inter" style={{ background: BG, color: INK, paddingBottom: 92 }}>

      {/* Barre de sortie — la porte de retour vers l'app */}
      <div className="flex items-center gap-2.5 px-3.5"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))', paddingBottom: 6 }}>
        <button
          onClick={() => router.push('/?tab=village')}
          aria-label="Revenir à La Place du Village"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
          style={{ border: `1px solid ${LINE}`, background: 'rgba(250,251,250,.05)', color: INK }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={() => router.push('/?tab=village')}
          className="min-w-0 truncate border-none bg-transparent p-0 text-left"
          style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: INK }}>
          La Place du Village
        </button>
        <a href={RADIO.site} target="_blank" rel="noopener noreferrer"
          className="ml-auto flex-none rounded-full no-underline"
          style={{ border: `1px solid ${ACCENT}`, padding: '7px 13px', fontSize: 12, fontWeight: 700, color: ACCENT }}>
          {RADIO.nom}
        </a>
      </div>

      <div className="px-3.5 pt-4">
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: 0, lineHeight: 1.15 }}>
          La sélection culturelle
        </h1>
        <p style={{ fontSize: 13.5, color: DIM, margin: '5px 0 0' }}>
          Chaque semaine, ce que {RADIO.nom} a retenu — et où y aller.
        </p>
      </div>

      {/* La saisie se fait DEPUIS le module, pas depuis un écran d'admin
          perdu ailleurs : c'est ici qu'on voit le résultat, donc ici qu'on
          doit pouvoir le corriger. Visible des seuls admins. */}
      {isAdmin && (
        <div className="px-3.5 pt-4">
          <Link href="/radio/admin" className="flex items-center gap-2 rounded-[14px] no-underline"
            style={{ border: `1px dashed ${LINE}`, padding: '11px 13px', color: ACCENT, fontSize: 13, fontWeight: 700 }}>
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            {emission ? 'Modifier cette émission' : 'Monter l’émission de la semaine'}
          </Link>
        </div>
      )}

      {/* ── L'émission ─────────────────────────────────────────────── */}
      <div className="px-3.5 pt-5">
        {isLoading && (
          <div className="rounded-[18px]" style={{ border: `1px solid ${LINE}`, padding: 18, color: DIM, fontSize: 13.5 }}>
            Chargement…
          </div>
        )}

        {!isLoading && !emission && (
          /* Une page de module dit d'elle-même quand elle est vide. */
          <div className="rounded-[18px]" style={{ border: `1px solid ${LINE}`, padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pas encore d’émission</div>
            <p style={{ fontSize: 13.5, color: DIM, margin: '6px 0 0', lineHeight: 1.5 }}>
              La sélection de la semaine n’est pas encore montée. Revenez d’ici
              quelques jours, ou écoutez directement sur {RADIO.nom}.
            </p>
          </div>
        )}

        {emission && (
          <div className="overflow-hidden rounded-[18px]" style={{ border: `1px solid ${LINE}`, background: 'rgba(246,239,230,.04)' }}>
            {emission.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emission.image_url} alt="" className="block h-36 w-full object-cover" />
            )}
            <div style={{ padding: 15 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: ACCENT }}>
                {libelleSemaine(emission.semaine_debut)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em', margin: '5px 0 0', lineHeight: 1.25 }}>
                {emission.titre}
              </div>
              {emission.description && (
                <p style={{ fontSize: 13.5, color: DIM, margin: '7px 0 0', lineHeight: 1.5 }}>{emission.description}</p>
              )}

              {/* Le lecteur natif : il sait déjà mettre en pause, reprendre,
                  se déplacer, et il survit au verrouillage de l'écran. Un
                  lecteur maison reperdrait tout ça. */}
              <audio
                controls
                preload="none"
                src={emission.audio_url}
                className="mt-3 w-full"
                style={{ height: 40 }}
              >
                <a href={emission.audio_url}>Écouter l’émission</a>
              </audio>

              {formatDuree(emission.duree_s) && (
                <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>{formatDuree(emission.duree_s)} d’écoute</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Ce que l'émission annonce ──────────────────────────────── */}
      {emission && mentions.length > 0 && (
        <div className="px-3.5 pt-7">
          <div className="flex items-baseline gap-2">
            <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', margin: 0 }}>
              Les rendez-vous cités
            </h2>
            <span style={{ fontSize: 12, color: DIM }}>{mentions.length}</span>
          </div>
          <div className="mt-1.5" style={{ borderTop: `1px solid ${LINE}` }}>
            {mentions.map(m => <LigneMention key={m.id} m={m} />)}
          </div>
        </div>
      )}

      {/* ── La carte sonore ────────────────────────────────────────── */}
      {surLaCarte.length > 0 && (
        <div className="px-3.5 pt-7">
          <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 8px' }}>
            La carte de la sélection
          </h2>
          <div className="overflow-hidden rounded-[18px]" style={{ border: `1px solid ${LINE}`, height: 340, position: 'relative' }}>
            {/* La MÊME carte que l'accueil, nourrie d'une liste réduite : le
                composant ne va rien chercher tout seul, `evenements` est une
                prop pure. Rien n'est réécrit ici. */}
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
          {mentions.length > surLaCarte.length && (
            <p style={{ fontSize: 12, color: DIM, margin: '8px 0 0' }}>
              {mentions.length - surLaCarte.length} rendez-vous cité
              {mentions.length - surLaCarte.length > 1 ? 's' : ''} n’{mentions.length - surLaCarte.length > 1 ? 'ont' : 'a'} pas
              d’adresse connue et n’apparaî{mentions.length - surLaCarte.length > 1 ? 'ssent' : 't'} pas sur la carte.
            </p>
          )}
        </div>
      )}

      <BottomNavBar />
    </div>
  )
}
