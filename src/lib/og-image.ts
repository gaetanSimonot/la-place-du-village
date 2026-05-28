/**
 * Helpers pour les images Open Graph (partage WhatsApp/Messenger/etc).
 *
 * Problème : WhatsApp/Messenger ne chargent pas un og:image > ~600 KB et
 * fallback sur le favicon. Les photos d'annonces/events stockées dans
 * Supabase Storage font souvent 2-5 MB → pas affichées dans les previews.
 *
 * Solution : Supabase Image Transformations (Pro+). On réécrit l'URL
 * `/storage/v1/object/public/...` en `/storage/v1/render/image/public/...`
 * avec des params width/height/quality → Supabase sert une version
 * redimensionnée et compressée à la volée, parfaitement adaptée à OG.
 */

interface TransformOpts {
  width:   number
  height:  number
  /** 1..100, défaut 75 (sweet spot taille/qualité pour OG). */
  quality?: number
  /** Mode de resize, défaut 'cover'. */
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * Si l'URL est une URL Supabase Storage publique, retourne la variante
 * render avec transformations appliquées. Sinon, retourne l'URL telle
 * quelle (URL externe, locale, etc.).
 */
export function withImageTransform(url: string, opts: TransformOpts): string {
  if (!url.includes('/storage/v1/object/public/')) return url
  const renderUrl = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  const params = new URLSearchParams()
  params.set('width',  String(opts.width))
  params.set('height', String(opts.height))
  params.set('resize', opts.resize ?? 'cover')
  params.set('quality', String(opts.quality ?? 75))
  return `${renderUrl}?${params.toString()}`
}

/** Dimensions OG standard 1200x630 + quality 75 → ~80-150 KB typique. */
export function ogTransform(url: string): string {
  return withImageTransform(url, { width: 1200, height: 630, quality: 75 })
}
