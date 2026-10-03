'use client'
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import type { EtablissementType } from '@/lib/types'
import EntityQuickView from '@/components/EntityQuickView'
import { shareLink } from '@/lib/share'

/**
 * LA FENÊTRE « DÉCOUVRIR » D'UN BON PLAN : encart promo + mini fiche du
 * commerce + « J'en profite ».
 *
 * Sortie de la page Bons plans pour s'ouvrir AUSSI par-dessus la carte de
 * l'accueil (mode Bons plans) sans la quitter. Elle ne sait pas utiliser un
 * bon plan : `onUse` dit quoi faire — la page Bons plans lance sa
 * confirmation, la carte y envoie.
 */

export const FREQ_LABEL: Record<string, string> = {
  always:  'Toujours',
  weekly:  '1× par semaine',
  monthly: '1× par mois',
}

export interface PromoDecouverte {
  id: string
  title: string
  description: string | null
  conditions: string | null
  display_image_url: string | null
  frequency: string
  valid_until: string | null
  etablissement: {
    id: string
    nom: string
    commune: string | null
    photos: string[] | null
    type: EtablissementType | null
  } | null
}

export default function DiscoverPromoModal({
  promo, onClose, onUse, isAdmin = false, onEdit, favorited = false, onToggleFav,
}: {
  promo: PromoDecouverte
  onClose: () => void
  onUse: () => void
  isAdmin?: boolean
  onEdit?: () => void
  favorited?: boolean
  onToggleFav?: () => void
}) {
  const [showEtabQuickView, setShowEtabQuickView] = useState(false)
  const etabPhoto = promo.etablissement?.photos?.[0]
  const etabTypeInfo = promo.etablissement?.type ? ETAB_TYPES[promo.etablissement.type] : null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[4px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-t-3xl bg-creme"
        style={{
          maxHeight: 'calc(100dvh - 40px)',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        }}
      >
        {/* Grabber + actions (partage, favori, fermer) */}
        <div className="relative">
          <div className="mx-auto mt-2 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />
          <div className="absolute left-3 top-2 flex gap-1.5">
            <button
              type="button"
              aria-label="Partager ce bon plan"
              onClick={() => shareLink({
                title: `${promo.title} — La Place du Village`,
                text:  `${promo.title}${promo.etablissement ? ' chez ' + promo.etablissement.nom : ''}`,
                url:   `https://laplaceduvillage.app/promotions?id=${promo.id}`,
              })}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white text-texte"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            {onToggleFav && (
              <button
                type="button"
                aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                onClick={onToggleFav}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={favorited ? '#E8622A' : 'none'} stroke={favorited ? '#E8622A' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={favorited ? '' : 'text-texte'}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white text-texte"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 pt-4" style={{ maxHeight: 'calc(100dvh - 200px)' }}>
          {/* Encart promo */}
          <div className="overflow-hidden rounded-[16px] border border-bordSoft bg-white">
            {promo.display_image_url && (
              <div className="relative h-[150px] bg-bord/40">
                <img src={promo.display_image_url} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-[5px] bg-[#E8622A] px-[7px] py-1 text-[9px] font-extrabold tracking-[0.08em] text-white">
                  BON PLAN
                </span>
              </div>
            )}
            <div className="px-4 py-3">
              <h2
                className="font-serif text-[20px] leading-[1.15] text-texte"
                style={{ letterSpacing: '-0.01em' }}
              >
                {promo.title}
              </h2>
              {promo.description && (
                <p className="mt-2 text-[13px] leading-[1.5] text-texte-doux">
                  {promo.description}
                </p>
              )}
              {promo.conditions && (
                <div className="mt-3 flex items-start gap-1.5 rounded-md bg-[#E8F2EB] px-2 py-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-primary">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <p className="text-[11px] font-semibold leading-[1.4] text-[#8A4A1F]">
                    {promo.conditions}
                  </p>
                </div>
              )}
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-texte-doux">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12 7 12 12 15 14"/>
                </svg>
                {FREQ_LABEL[promo.frequency] ?? promo.frequency}
                {promo.valid_until && ` · valable jusqu'au ${new Date(promo.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
              </p>
            </div>
          </div>

          {/* Encart etablissement (clic = dépliage quickview, pas navigation) */}
          {promo.etablissement && (
            <button
              type="button"
              onClick={() => setShowEtabQuickView(true)}
              className="mt-3 flex w-full items-center gap-3 overflow-hidden rounded-[16px] border border-bordSoft bg-white p-3 text-left"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-bord/40">
                {etabPhoto && <img src={etabPhoto} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                {etabTypeInfo && (
                  <div className="text-[9px] font-extrabold tracking-[0.1em] uppercase text-primary">
                    {etabTypeInfo.label}
                  </div>
                )}
                <div className="mt-0.5 truncate font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                  {promo.etablissement.nom}
                </div>
                {promo.etablissement.commune && (
                  <div className="mt-0.5 truncate text-[11px] text-texte-doux">
                    {promo.etablissement.commune}
                  </div>
                )}
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-doux">
                <polyline points="9 6 15 12 9 18"/>
              </svg>
            </button>
          )}
        </div>

        {/* CTA J'en profite sticky (+ Modifier admin) */}
        <div className="border-t border-bord bg-white px-4 py-3">
          {isAdmin && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="mb-2 w-full rounded-[12px] border-[1.5px] border-[#E8A627] bg-[#FFF8E8] py-2.5 text-[13px] font-extrabold text-[#B07E1F]"
            >
              ✏️ Modifier la promotion (admin)
            </button>
          )}
          <button
            type="button"
            onClick={onUse}
            className="w-full rounded-[12px] bg-accent py-3 text-[14px] font-bold text-white"
            style={{ boxShadow: '0 4px 14px rgba(200,75,47,0.32)' }}
          >
            J&apos;en profite
          </button>
        </div>
      </div>

      {/* QuickView fiche etab/producer empilée au-dessus (clic Fermer revient ici) */}
      {showEtabQuickView && promo.etablissement && (
        <EntityQuickView
          kind="etablissement"
          id={promo.etablissement.id}
          onClose={() => setShowEtabQuickView(false)}
        />
      )}
    </div>
  )
}
