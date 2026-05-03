'use client'
import { useState } from 'react'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import Image from 'next/image'
import { useAdminSession } from '@/hooks/useAdminSession'
import EventEditDrawer from '@/components/EventEditDrawer'

interface Props {
  evenement: Evenement
  isSelected?: boolean
  onClick?: () => void
}

export default function EventCard({ evenement, isSelected, onClick }: Props) {
  const cat = CATEGORIES[evenement.categorie] ?? CATEGORIES.autre
  const lieu = evenement.lieux
  const isAdmin = useAdminSession()
  const [editing, setEditing] = useState(false)

  return (
    <>
      <div className="relative">
        <Link
          href={`/evenement/${evenement.id}`}
          onClick={onClick}
          className="block bg-white rounded-[16px] overflow-hidden transition-all active:scale-[0.98]"
          style={{
            boxShadow: isSelected
              ? `0 0 0 2px var(--orange), 0 4px 16px rgba(232,98,42,0.15)`
              : '0 2px 12px rgba(44,44,44,0.08)',
          }}
        >
          {evenement.image_url && (
            <div className="w-full h-36 overflow-hidden relative" style={{ backgroundColor: '#f0ece6' }}>
              <Image
                src={evenement.image_url}
                alt={evenement.titre}
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
                style={{ objectPosition: evenement.image_position ?? '50% 50%' }}
              />
            </div>
          )}
          <div className="p-3">
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full text-white mb-2"
              style={{ backgroundColor: cat.color }}
            >
              {cat.emoji} {cat.label}
            </span>

            <h3
              className="font-title text-[var(--texte)] text-base leading-tight mb-1"
            >
              {evenement.titre}
            </h3>

            {evenement.date_debut && (
              <p className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>
                {formatDate(evenement.date_debut)}
                {evenement.heure && ` · ${evenement.heure.slice(0, 5)}`}
              </p>
            )}

            {lieu && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--gris)' }}>
                {isApproxLocation(lieu) ? '📍~' : '📍'}{' '}
                {lieu.nom}{lieu.commune ? `, ${lieu.commune}` : ''}
                {isApproxLocation(lieu) && (
                  <span className="ml-1 font-medium" style={{ color: 'var(--orange)' }}>approx.</span>
                )}
              </p>
            )}

            {evenement.prix && (
              <span
                className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#EDF3EC', color: 'var(--vert)' }}
              >
                {evenement.prix}
              </span>
            )}
          </div>
        </Link>

        {isAdmin && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); setEditing(true) }}
            className="absolute top-2 right-2 bg-[#2C1810]/70 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg backdrop-blur-sm"
          >
            ✏️
          </button>
        )}
      </div>

      {editing && (
        <EventEditDrawer
          evenementId={evenement.id}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
