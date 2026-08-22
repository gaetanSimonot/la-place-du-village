'use client'
import Link from 'next/link'
import EventCard from '@/components/EventCard'
import type { Evenement } from '@/lib/types'

/**
 * ASSISTANT VILLAGE — une fiche réelle dans le fil de conversation.
 *
 * Ces cartes ne viennent JAMAIS du texte du modèle : le serveur les a lues
 * en base et les envoie à part. Le modèle n'écrit que des identifiants. Une
 * carte affichée est donc, par construction, une vraie fiche — et le clic
 * ouvre la vraie page de l'application. L'assistant est une façon de
 * naviguer dans La Place du Village, pas un endroit qui la recopie.
 *
 * L'événement réutilise `EventCard`, la carte du reste de l'app. Les autres
 * familles n'ont pas de composant autonome équivalent (l'établissement est
 * rendu à l'intérieur des listes de la carte) : elles ont ici une ligne
 * compacte, parce qu'un fil de conversation entrecoupé de grandes cartes
 * pleine largeur ne se lit plus.
 */

export interface CarteData {
  type: 'ev' | 'etab' | 'film' | 'promo' | 'annonce'
  id: string
  data: Record<string, unknown>
}

const CADRE: React.CSSProperties = {
  display: 'flex', gap: 11, alignItems: 'center',
  border: '1px solid #F0EAE0', borderRadius: 14, background: '#fff',
  padding: 10, textDecoration: 'none', marginBottom: 8,
}
const TITRE: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: '#1A1209', letterSpacing: '-.01em' }
const SOUS: React.CSSProperties = { fontSize: 11, color: '#7A6A5A', marginTop: 2 }

function Vignette({ url, ratio = 1 }: { url: string | null; ratio?: number }) {
  return (
    <span className="flex-none overflow-hidden"
      style={{ width: 54, aspectRatio: `${ratio}`, borderRadius: 10, background: '#F4EFE7', display: 'block' }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
    </span>
  )
}

const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const premiere = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)

export default function CarteResultat({ carte, onOuvrir }: { carte: CarteData; onOuvrir?: () => void }) {
  const d = carte.data

  if (carte.type === 'ev') {
    return (
      <div className="mb-2" onClick={onOuvrir}>
        <EventCard evenement={d as unknown as Evenement} />
      </div>
    )
  }

  if (carte.type === 'film') {
    const seances = Array.isArray(d.seances) ? (d.seances as Record<string, unknown>[]) : []
    const prochaine = seances[0]
    return (
      <Link href={`/cinema/film/${carte.id}`} onClick={onOuvrir} style={CADRE}>
        <Vignette url={s(d.affiche_url)} ratio={2 / 3} />
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={TITRE}>{s(d.titre) ?? 'Film'}</span>
          <span className="block truncate" style={SOUS}>
            {prochaine
              ? `${s(prochaine.cinema) ?? 'Cinéma'} · ${s(prochaine.date) ?? ''} ${s(prochaine.heure) ?? ''}`
              : [d.duree_min ? `${d.duree_min} min` : null, premiere(d.genres)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </Link>
    )
  }

  if (carte.type === 'etab') {
    const misEnAvant = d.is_featured === true || d.plan === 'pro'
    return (
      <Link href={`/etablissement/${carte.id}`} onClick={onOuvrir} style={CADRE}>
        <Vignette url={premiere(d.photos)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={TITRE}>{s(d.nom) ?? 'Établissement'}</span>
          <span className="block truncate" style={SOUS}>
            {[s(d.commune), typeof d.note_google === 'number' ? `${d.note_google.toFixed(1)} ★` : null]
              .filter(Boolean).join(' · ')}
          </span>
        </span>
        {/* La mise en avant reste NOMMÉE, jamais traduite en jugement : c'est
            la condition pour qu'on puisse continuer à faire confiance au reste. */}
        {misEnAvant && (
          <span className="flex-none" style={{ fontSize: 9.5, fontWeight: 800, color: '#C84B2F', border: '1px solid #F6D9CE', borderRadius: 999, padding: '3px 7px', whiteSpace: 'nowrap' }}>
            À la une
          </span>
        )}
      </Link>
    )
  }

  if (carte.type === 'promo') {
    const etab = (d.etablissement ?? null) as Record<string, unknown> | null
    // Pas de page par promotion dans l'app : la fiche de l'établissement est
    // l'endroit où elle se présente vraiment.
    const href = etab?.id ? `/etablissement/${etab.id}` : '/promotions'
    return (
      <Link href={href} onClick={onOuvrir} style={CADRE}>
        <Vignette url={s(d.image_url) ?? premiere(etab?.photos)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={TITRE}>{s(d.title) ?? 'Bon plan'}</span>
          <span className="block truncate" style={SOUS}>
            {[s(etab?.nom), s(etab?.commune)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </Link>
    )
  }

  const prix = typeof d.prix_actuel === 'number' ? d.prix_actuel
    : typeof d.prix_initial === 'number' ? d.prix_initial : null
  return (
    <Link href={`/annonces/${carte.id}`} onClick={onOuvrir} style={CADRE}>
      <Vignette url={premiere(d.photos)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={TITRE}>{s(d.titre) ?? 'Annonce'}</span>
        <span className="block truncate" style={SOUS}>
          {[prix !== null ? `${prix} €` : null, s(d.ville)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  )
}
