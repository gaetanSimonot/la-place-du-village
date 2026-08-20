'use client'
import Image from 'next/image'
import ClientPortal from './ClientPortal'
import type { SplashPromoVariantId } from '@/lib/splashPromo'

/**
 * Splash promotionnel de l'offre Habitant — rendu fidèle à la maquette de
 * handoff (`DESIGN/maquette/handoff-splash-habitant/maquette.html`).
 *
 * Ce composant ne fait QUE dessiner : il ne compte pas les visites, ne lit pas
 * le cooldown et n'écrit rien. Les règles de diffusion sont la responsabilité
 * de PromoSplashGate. C'est ce qui permet à l'admin de l'ouvrir à la demande
 * sans perturber ce que voient les habitants.
 *
 * Passe par ClientPortal : sans lui, une modale rendue dans un parent qui a son
 * propre z-index reste confinée et la BottomNavBar lui passe par-dessus.
 */

interface Props {
  variant: SplashPromoVariantId
  onClose: () => void
  /** Clic sur « Découvrir les avantages ». */
  onDiscover: () => void
  /** Aperçu admin : bandeau explicite pour ne pas confondre avec le vrai. */
  preview?: boolean
}

const CONTENT: Record<SplashPromoVariantId, {
  img: string; alt: string; contain?: boolean
  title: string; body: string; caption: string
}> = {
  decouverte: {
    img: '/splash/splash-decouverte.webp',
    alt: 'La Place du Village',
    title: 'Profitez encore plus de La Place du Village',
    body: 'Bons plans, privilèges Habitant et plus de possibilités pour participer à la vie locale.',
    caption: 'Le prix d’un gros café.',
  },
  economies: {
    img: '/splash/splash-economies.webp',
    alt: 'Bons plans du coin',
    contain: true,
    title: 'Et si votre abonnement se remboursait tout seul ?',
    body: 'Profitez de toutes les promotions proposées par les commerces du coin.',
    caption: 'Une seule bonne affaire peut suffire.',
  },
  soutien: {
    img: '/splash/splash-soutien.webp',
    alt: 'Ensemble, soutenons notre village',
    title: 'La Place du Village vous est utile ?',
    body: 'Pour le prix d’un gros café par mois, soutenez un service local indépendant et profitez de tous les privilèges Habitant.',
    caption: 'Sans engagement.',
  },
}

export default function SplashPromoView({ variant, onClose, onDiscover, preview = false }: Props) {
  const c = CONTENT[variant]

  return (
    <ClientPortal>
      <div
        className="fixed inset-0 z-[4000] flex items-end justify-center bg-black/45 p-3 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Offre Habitant"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[460px] overflow-hidden rounded-[26px] bg-[#FBF7EE] pb-5 shadow-2xl"
          style={{ maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          {preview && (
            <div className="bg-[#FFF1E8] px-4 py-2 text-center text-[11px] font-extrabold text-[#C0440A]">
              Aperçu admin — invisible pour les habitants
            </div>
          )}

          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#FBF7EE] text-xl font-bold text-[#26402B] shadow-md"
            style={preview ? { top: 48 } : undefined}
          >
            ×
          </button>

          <div className={`relative aspect-[3/2] ${c.contain ? 'bg-[#FBF7EE]' : 'bg-[#EDE6D5]'}`}>
            <Image
              src={c.img}
              alt={c.alt}
              fill
              sizes="(max-width: 460px) 100vw, 460px"
              className={c.contain ? 'object-contain' : 'object-cover'}
              priority
            />
          </div>

          <div className="px-7 pt-6 text-center">
            <div className="text-[12.5px] font-extrabold uppercase tracking-[2.4px] text-[#E8632B]">
              Offre Habitant
            </div>

            <h2 className="mx-auto mt-3 max-w-[330px] font-archivo text-[30px] font-black leading-[1.13] tracking-[-0.8px] text-[#26402B] text-balance">
              {c.title}
            </h2>

            <p className="mx-auto mt-3.5 max-w-[350px] font-nunito text-[15.5px] font-semibold leading-[1.52] text-[#5D6357] text-pretty">
              {c.body}
            </p>

            <div className="mx-auto mt-5 inline-flex flex-col items-center rounded-2xl bg-[#E9EFDF] px-[30px] py-3.5">
              <div className="font-archivo text-[29px] font-black leading-[1.05] tracking-[-0.8px] text-[#26402B]">
                4,99 €<span className="font-nunito text-[15px] font-bold text-[#5D6357]"> /mois</span>
              </div>
              <div className="font-caveat text-[17px] font-semibold text-[#5D6357]">{c.caption}</div>
            </div>

            <button
              onClick={onDiscover}
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-full bg-[#26402B] px-5 py-[18px] font-archivo text-[18px] font-extrabold text-[#FBF5E7]"
            >
              Découvrir les avantages <span aria-hidden>→</span>
            </button>

            <button
              onClick={onClose}
              className="mt-2 w-full py-2.5 font-nunito text-[15px] font-extrabold text-[#6E6E5A]"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}
