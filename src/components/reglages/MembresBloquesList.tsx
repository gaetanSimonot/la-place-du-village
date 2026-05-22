'use client'

const IcSlash = (
  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
)

/**
 * Liste des membres que l'user a bloqués.
 *
 * V1 : placeholder propre tant que le système de blocage côté UI n'est pas
 * câblé (table user_blocks + API + bouton ⋯ sur les profils). Une PR dédiée
 * activera le vrai fetch + bouton "Débloquer" par ligne.
 */
export default function MembresBloquesList() {
  return (
    <div className="px-4 pt-6">
      <div
        className="flex flex-col items-center rounded-[16px] border bg-white px-6 py-10 text-center"
        style={{ borderColor: '#F0EAE0' }}
      >
        <div
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: '#FBE9E5', color: '#B53A22' }}
        >
          {IcSlash}
        </div>
        <div className="text-[14px] font-extrabold text-texte">Aucun membre bloqué</div>
        <p className="m-0 mt-1.5 max-w-[280px] text-[12.5px] leading-[1.5] text-texte-doux">
          Pour bloquer un membre, va sur son profil et tape sur le menu ⋯ en haut à droite.
          Tu pourras le débloquer ici à tout moment.
        </p>
      </div>
    </div>
  )
}
