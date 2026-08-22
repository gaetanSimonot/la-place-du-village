'use client'
import ClientPortal from '@/components/ClientPortal'

/**
 * Lecture d'une bande-annonce, en surimpression.
 *
 * Poids : l'iframe n'est créée QUE lorsqu'on ouvre la fenêtre. Tant qu'on ne
 * tape pas, ça ne coûte rien — ni requête, ni script. À l'ouverture, YouTube
 * charge son lecteur (~1 Mo) ; c'est le prix d'une vidéo, et il est consenti
 * puisqu'on vient de demander à la voir. Notre propre paquet ne grossit que
 * de ce fichier.
 *
 * Domaine `youtube-nocookie.com` : pas de cookie tant que la lecture n'a pas
 * commencé. Cohérent avec la politique de confidentialité de l'app.
 */

/** Extrait l'identifiant d'une URL YouTube, quelle que soit sa forme. */
export function idYoutube(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return m?.[1] ?? null
}

export default function BandeAnnonce({ url, titre, onClose }: {
  url: string
  titre?: string
  onClose: () => void
}) {
  const id = idYoutube(url)

  // Lien non reconnu (autre hébergeur, format inattendu) : plutôt que d'afficher
  // un cadre vide, on ouvre la vidéo là où elle vit.
  if (!id) {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
    onClose()
    return null
  }

  return (
    <ClientPortal>
      <div
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={titre ? `Bande-annonce — ${titre}` : 'Bande-annonce'}
        className="fixed inset-0 z-[3600] flex items-center justify-center p-3"
        style={{ background: 'rgba(10,8,6,0.88)' }}
      >
        <div onClick={e => e.stopPropagation()} className="w-full max-w-[560px]">
          <div className="relative w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: '16 / 9', background: '#000' }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
              title={titre ? `Bande-annonce de ${titre}` : 'Bande-annonce'}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
          <button
            onClick={onClose}
            className="mx-auto mt-3 block border-none bg-transparent px-4 py-2 text-[13px] font-extrabold"
            style={{ color: '#F4E7CE' }}
          >
            Fermer
          </button>
        </div>
      </div>
    </ClientPortal>
  )
}
