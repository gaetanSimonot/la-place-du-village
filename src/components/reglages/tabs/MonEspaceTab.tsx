'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/contexts/AuthContext'
import { GroupCard, NavRow, I } from '../shared'
import PushToggle from '../PushToggle'
import type { ReglagesSubView } from '../ReglagesView'

interface Etab {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
  plan: string | null
}

interface Props {
  profile: Profile
  onOpenSub: (sub: ReglagesSubView) => void
}

export default function MonEspaceTab({ profile, onOpenSub }: Props) {
  const [etabs, setEtabs]         = useState<Etab[]>([])
  const [hasProducer, setHasProducer] = useState(false)

  useEffect(() => {
    if (!profile.id) return
    let cancelled = false

    supabase
      .from('etablissements')
      .select('id, nom, commune, photos, plan')
      .eq('user_id', profile.id)
      .order('nom', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setEtabs((data as Etab[] | null) ?? [])
      })

    supabase
      .from('producers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .then(({ count }) => {
        if (!cancelled) setHasProducer((count ?? 0) > 0)
      })

    return () => { cancelled = true }
  }, [profile.id])

  return (
    <div className="flex flex-col gap-3.5">
      {/* Notifications push */}
      <PushToggle />

      {/* Contenus & publications */}
      <GroupCard kicker="Contenus & publications" kickerColor="#2D5A3D">
        <NavRow icon={I.cal(16)}     label="Mes événements"     sub="Publiés, brouillons"          onClick={() => onOpenSub('events')} />
        <NavRow icon={I.mega(16)}    label="Mes annonces"       sub="Actives, vendues, archivées"  onClick={() => onOpenSub('annonces')} />
        <NavRow icon={I.gift(16)}    label="Mes promotions"     sub="Pour les commerçants"         href="/promotions" badge="Pro" />
        <NavRow icon={I.journal(16)} label="Mes articles"       sub="Brouillons, soumissions"      href="/journal/articles" />
        <NavRow icon={I.rocket(16)}  label="Visibilité & boost" sub="Mettre en avant mes contenus" href="/profil/visibilite" isLast />
      </GroupCard>

      {/* Mes fiches pro (déplié si l'user en gère) */}
      {(hasProducer || etabs.length > 0) && (
        <GroupCard kicker="Mes fiches pro" kickerColor="#2D5A3D" icon={I.store(12)}>
          {hasProducer && (
            <NavRow
              icon={I.leaf(16)}
              label="Ma fiche producteur"
              sub="Vitrine, produits, carte"
              onClick={() => onOpenSub('producteur')}
              isLast={etabs.length === 0}
            />
          )}
          {etabs.map((e, idx) => (
            <Link
              key={e.id}
              href={`/etablissement/${e.id}`}
              className="flex w-full items-center gap-3 bg-transparent px-3.5 py-3 text-inherit no-underline"
              style={{ borderBottom: idx === etabs.length - 1 ? 'none' : '1px solid #F0EAE0' }}
            >
              <div
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-primary-light text-primary"
                aria-hidden
              >
                {e.photos?.[0]
                  ? <img src={e.photos[0]} alt="" className="h-full w-full object-cover" />
                  : I.store(16)}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
                  {e.nom}
                </div>
                {e.commune && <div className="mt-[1px] truncate text-[11px] text-texte-doux">{e.commune}</div>}
              </div>
              {e.plan && e.plan !== 'basic' && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase"
                  style={{ background: '#E8F2EB', color: '#2D5A3D', letterSpacing: '0.08em' }}
                >
                  {e.plan}
                </span>
              )}
              <span className="shrink-0 text-texte-tres-doux">{I.chev(14)}</span>
            </Link>
          ))}
        </GroupCard>
      )}

      {/* Communauté */}
      <GroupCard kicker="Communauté" kickerColor="#7C5C3B" icon={I.group(12)}>
        <NavRow
          icon={I.group(16)}
          label="Mes abonnements"
          sub="Profils & lieux que je suis"
          onClick={() => onOpenSub('abonnements')}
          isLast
        />
      </GroupCard>
    </div>
  )
}
