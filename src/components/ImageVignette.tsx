'use client'

import { useState, type ImgHTMLAttributes } from 'react'
import { vignetteDe } from '@/lib/vignettes'

/**
 * Une affiche affichée en petit : la miniature si elle existe, l'original
 * sinon (cf. lib/vignettes.ts). Une miniature pas encore fabriquée — affiche
 * envoyée il y a quelques minutes — coûte un aller-retour, jamais une image
 * cassée.
 */
export default function ImageVignette({ src, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }) {
  const vignette = vignetteDe(src)
  const [manquante, setManquante] = useState<string | null>(null)
  const url = vignette && manquante !== vignette ? vignette : src
  return (
    // eslint-disable-next-line jsx-a11y/alt-text -- alt transmis par les props
    <img
      {...props}
      src={url}
      onError={e => {
        if (vignette && url === vignette) { setManquante(vignette); return }
        props.onError?.(e)
      }}
    />
  )
}
