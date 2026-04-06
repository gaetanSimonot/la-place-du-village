import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'

interface Props {
  evenement: Evenement
  isSelected?: boolean
  onClick?: () => void
}

export default function EventCard({ evenement, isSelected, onClick }: Props) {
  const cat = CATEGORIES[evenement.categorie] ?? CATEGORIES.autre
  const lieu = evenement.lieux

  return (
    <Link
      href={`/evenement/${evenement.id}`}
      onClick={onClick}
      className={`block bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all active:scale-[0.98] ${
        isSelected ? 'border-[#C4622D] shadow-md' : 'border-transparent'
      }`}
    >
      {evenement.image_url && (
        <img
          src={evenement.image_url}
          alt={evenement.titre}
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-3">
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full text-white mb-2"
          style={{ backgroundColor: cat.color }}
        >
          {cat.emoji} {cat.label}
        </span>

        <h3 className="font-bold text-[#2C1810] text-base leading-tight mb-1">
          {evenement.titre}
        </h3>

        {evenement.date_debut && (
          <p className="text-sm text-[#C4622D] font-medium">
            {formatDate(evenement.date_debut)}
            {evenement.heure && ` · ${evenement.heure.slice(0, 5)}`}
          </p>
        )}

        {lieu && (
          <p className="text-xs text-gray-500 mt-0.5">
            {isApproxLocation(lieu) ? '📍~' : '📍'}{' '}
            {lieu.nom}{lieu.commune ? `, ${lieu.commune}` : ''}
            {isApproxLocation(lieu) && (
              <span className="ml-1 text-orange-400 font-medium">approx.</span>
            )}
          </p>
        )}

        {evenement.prix && (
          <span className="inline-block mt-1.5 text-xs bg-[#FBF7F0] text-[#6B7C3A] font-semibold px-2 py-0.5 rounded-full">
            {evenement.prix}
          </span>
        )}
      </div>
    </Link>
  )
}
