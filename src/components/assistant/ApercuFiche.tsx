'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import { trackEvent } from '@/lib/analytics'
import type { CarteData } from '@/components/assistant/CarteResultat'
import { imageEvenement } from '@/lib/imageEvenement'

/**
 * ASSISTANT VILLAGE — l'aperçu d'une fiche, sans quitter la conversation.
 *
 * Cliquer sur une proposition faisait quitter l'écran : on revenait, on avait
 * perdu le fil, et on cessait d'explorer ce qui était proposé. L'aperçu
 * répond à la vraie question — « c'est quoi, c'est où, ça m'intéresse ? » —
 * en gardant la conversation dessous. On garde en un geste, on ouvre la
 * vraie fiche si on veut tout.
 *
 * Les données affichées sont celles que l'outil a lues en base : rien n'est
 * redemandé, rien n'est réécrit par le modèle.
 */

interface Props {
  carte: CarteData
  onClose: () => void
}

/** Où vit vraiment cette fiche, et sous quel nom on la met en favori. */
const ROUTES: Record<string, { page: (id: string) => string; api?: string; quoi: string }> = {
  ev:      { page: id => `/evenement/${id}`,     api: 'evenements',     quoi: 'Événement' },
  etab:    { page: id => `/etablissement/${id}`, api: 'etablissements', quoi: 'Établissement' },
  prod:    { page: id => `/producteur/${id}`,    api: 'producers',      quoi: 'Producteur' },
  annonce: { page: id => `/annonces/${id}`,      api: 'annonces',       quoi: 'Annonce' },
  // Pas de page par promotion : elle se lit sur la liste des bons plans.
  promo:   { page: () => '/promotions',          api: 'promotions',     quoi: 'Bon plan' },
  film:    { page: id => `/cinema/film/${id}`,   quoi: 'Film' },
}

const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const premiere = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)

function jourLong(iso: string | null): string {
  if (!iso) return ''
  const d = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${iso}T12:00:00Z`))
  return d.charAt(0).toUpperCase() + d.slice(1)
}

export default function ApercuFiche({ carte, onClose }: Props) {
  const d = carte.data
  const route = ROUTES[carte.type] ?? ROUTES.etab
  const [favori, setFavori] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const titre = s(d.nom) ?? s(d.titre) ?? s(d.title) ?? 'Fiche'
  // Pour un événement, le helper de l'app décide : il connaît les
  // illustrations de repli que `image_url` seul ignore.
  const image = (carte.type === 'ev'
    ? imageEvenement(d as { image_url?: string | null; categorie?: string | null; categories?: string[] | null })
    : null)
    ?? s(d.image_url) ?? s(d.affiche_url) ?? premiere(d.photos)
    ?? premiere((d.etablissement as Record<string, unknown> | null)?.photos)

  // L'état du favori est celui du serveur : le cœur ne doit pas mentir.
  useEffect(() => {
    if (!route.api) return
    let annule = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { if (!annule) setFavori(false); return }
        const r = await fetch(`/api/${route.api}/${carte.id}/favorite`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const j = await r.json().catch(() => null)
        if (!annule) setFavori(!!j?.favorited)
      } catch { if (!annule) setFavori(false) }
    })()
    return () => { annule = true }
  }, [carte.id, route.api])

  async function basculerFavori() {
    if (!route.api || busy) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Sans compte, on ne peut rien garder : on le dit plutôt que de faire
        // semblant, et la fiche reste ouverte.
        alert('Créez un compte pour garder vos favoris.')
        return
      }
      const r = await fetch(`/api/${route.api}/${carte.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await r.json().catch(() => null)
      if (r.ok) {
        setFavori(!!j?.favorited)
        trackEvent('assistant_favori', { type: carte.type })
        if (j?.favorited) window.dispatchEvent(new CustomEvent('lpv:favori'))
      }
    } finally { setBusy(false) }
  }

  /* Les quelques lignes qui aident vraiment à décider, selon la nature. */
  const lignes: string[] = []
  if (carte.type === 'ev') {
    const lieu = d.lieux as Record<string, unknown> | null
    lignes.push([jourLong(s(d.date_debut)), s(d.heure)?.slice(0, 5)].filter(Boolean).join(' · '))
    lignes.push([s(lieu?.nom), s(lieu?.commune)].filter(Boolean).join(' · '))
    if (s(d.prix)) lignes.push(String(d.prix))
  } else if (carte.type === 'film') {
    const se = Array.isArray(d.seances) ? (d.seances as Record<string, unknown>[]) : []
    lignes.push([d.duree_min ? `${d.duree_min} min` : null, (d.genres as string[] | null)?.join(', ')].filter(Boolean).join(' · '))
    for (const x of se.slice(0, 4)) {
      lignes.push([jourLong(s(x.date)), s(x.heure), s(x.version)?.toUpperCase(), s(x.cinema)].filter(Boolean).join(' · '))
    }
  } else if (carte.type === 'promo') {
    const e = d.etablissement as Record<string, unknown> | null
    lignes.push([s(e?.nom), s(e?.commune)].filter(Boolean).join(' · '))
    if (s(d.conditions)) lignes.push(String(d.conditions))
  } else if (carte.type === 'annonce') {
    const prix = typeof d.prix_actuel === 'number' ? d.prix_actuel : d.prix_initial
    lignes.push([typeof prix === 'number' ? `${prix} €` : null, s(d.ville)].filter(Boolean).join(' · '))
  } else {
    lignes.push([s(d.adresse), s(d.commune)].filter(Boolean).join(' · '))
    if (s(d.contact_tel)) lignes.push(String(d.contact_tel))
  }

  const texte = s(d.description_courte) ?? s(d.description) ?? s(d.synopsis) ?? s(d.description_longue)

  return (
    <ClientPortal>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(26,18,9,.45)', display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxHeight: '82vh', overflowY: 'auto', background: 'var(--creme)',
            borderRadius: '20px 20px 0 0', paddingBottom: 'max(env(safe-area-inset-bottom),14px)',
          }}>
          {/* Poignée : on comprend qu'on peut refermer. */}
          <div className="flex justify-center" style={{ padding: '9px 0 4px' }}>
            <span style={{ width: 38, height: 4, borderRadius: 99, background: '#E3D9C8', display: 'block' }} />
          </div>

          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }} />
          )}

          <div style={{ padding: '14px 16px 4px' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#A99B89' }}>
              {route.quoi}
            </span>
            <h2 className="m-0 font-title" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-.01em', marginTop: 4 }}>
              {titre}
            </h2>
            {lignes.filter(Boolean).map((l, i) => (
              <p key={i} className="m-0" style={{ fontSize: 12.5, color: '#5A4C3E', marginTop: 4 }}>{l}</p>
            ))}
            {texte && (
              <p className="m-0" style={{ fontSize: 13, lineHeight: 1.5, color: '#2C2116', marginTop: 10 }}>
                {String(texte).slice(0, 420)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2" style={{ padding: '14px 16px 16px' }}>
            {route.api && (
              <button onClick={basculerFavori} disabled={busy}
                className="flex flex-none items-center justify-center gap-2 bg-white"
                style={{
                  border: `1px solid ${favori ? '#F0B0A0' : 'var(--bord)'}`, borderRadius: 12,
                  padding: '11px 14px', fontSize: 13, fontWeight: 800,
                  color: favori ? '#C84B2F' : '#5A4C3E',
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill={favori ? '#C84B2F' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />
                </svg>
                {favori ? 'Gardé' : 'Garder'}
              </button>
            )}
            <Link href={route.page(carte.id)} onClick={onClose}
              className="flex-1 border-none text-center text-white no-underline"
              style={{ background: 'var(--primary)', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 800 }}>
              Ouvrir la fiche
            </Link>
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}
