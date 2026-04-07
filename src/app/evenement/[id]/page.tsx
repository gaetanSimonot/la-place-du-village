import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import ImageLightbox from '@/components/ImageLightbox'
import FeedbackButton from '@/components/FeedbackButton'

export default async function EvenementPage({ params }: { params: { id: string } }) {
  const { data } = await supabase
    .from('evenements')
    .select('*, lieux(*)')
    .eq('id', params.id)
    .single()

  if (!data) notFound()

  const evt = data as Evenement
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu = evt.lieux

  const mapsUrl = lieu?.lat && lieu?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lieu.lat},${lieu.lng}`
    : lieu?.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lieu.adresse)}`
    : null

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold text-[#2C1810] flex-1 truncate text-base">{evt.titre}</h1>
      </div>

      {evt.image_url && (
        <ImageLightbox src={evt.image_url} alt={evt.titre} />
      )}

      <div className="p-4 space-y-3 pb-8">
        {/* Badge + titre */}
        <div>
          <span
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full text-white mb-2"
            style={{ backgroundColor: cat.color }}
          >
            {cat.emoji} {cat.label}
          </span>
          <h2 className="text-2xl font-bold text-[#2C1810] leading-tight">{evt.titre}</h2>
        </div>

        {/* Infos pratiques */}
        <div className="bg-white rounded-2xl p-4 space-y-2.5">
          {evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="font-medium">{formatDate(evt.date_debut, 'long')}</span>
            </div>
          )}
          {evt.date_fin && evt.date_fin !== evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="text-gray-500">jusqu&apos;au {formatDate(evt.date_fin, 'long')}</span>
            </div>
          )}
          {evt.heure && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">🕐</span>
              <span className="font-medium">{evt.heure.slice(0, 5)}</span>
            </div>
          )}
          {lieu && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-base mt-0.5">{isApproxLocation(lieu) ? '📍' : '📍'}</span>
              <div>
                <span className="font-medium">{lieu.nom}</span>
                {isApproxLocation(lieu) && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-500 font-semibold px-1.5 py-0.5 rounded-full">
                    localisation approximative
                  </span>
                )}
                {lieu.adresse && <p className="text-gray-500 text-xs">{lieu.adresse}</p>}
                {lieu.commune && !lieu.adresse && (
                  <p className="text-gray-500 text-xs">{lieu.commune}</p>
                )}
              </div>
            </div>
          )}
          {evt.prix && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">💶</span>
              <span className="font-medium">{evt.prix}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {evt.description && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-[#2C1810] mb-2">À propos</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{evt.description}</p>
          </div>
        )}

        {/* Contact / Organisateurs */}
        {(evt.contact || evt.organisateurs) && (
          <div className="bg-white rounded-2xl p-4 space-y-1.5">
            <h3 className="font-bold text-[#2C1810] mb-1">Contact</h3>
            {evt.organisateurs && (
              <p className="text-sm text-gray-600">🏛️ {evt.organisateurs}</p>
            )}
            {evt.contact && (
              <p className="text-sm text-gray-600">📞 {evt.contact}</p>
            )}
          </div>
        )}

        {/* Bouton Y aller */}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-[#C4622D] text-white text-center py-4 rounded-2xl font-bold text-base shadow-md active:bg-[#A8521E] transition-colors"
          >
            🗺️ Y aller
          </a>
        )}

        {/* Bouton correction */}
        <FeedbackButton evenementId={evt.id} evenementTitre={evt.titre} />
      </div>
    </div>
  )
}
