// Modèle de média partagé entre posts (mur) et messages (chat).
// Stocké en jsonb dans posts.media / messages.media.

export type MediaItem =
  | { t: 'photo'; url: string }
  | { t: 'youtube'; id: string }
  | { t: 'link'; url: string; title?: string | null; description?: string | null; image?: string | null }

export const MAX_PHOTOS = 4

/** Extrait l'ID vidéo YouTube d'une URL (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v') ?? ''
        return /^[\w-]{11}$/.test(id) ? id : null
      }
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)
      if (m) return m[1]
    }
    return null
  } catch {
    return null
  }
}

/** Miniature YouTube (haute def, fallback automatique côté Google). */
export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

/** URL d'intégration du lecteur YouTube (sans cookies). */
export function youtubeEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`
}

/**
 * Valide/normalise un tableau de médias reçu du client avant insertion DB.
 * - photo : url doit être une URL http(s) Supabase Storage (anti-injection)
 * - youtube : id alphanum 11 chars
 * - link : url http(s) ; title/description/image optionnels (strings courtes)
 * Limite le nombre de photos à MAX_PHOTOS, et au global à 6 items.
 */
export function sanitizeMedia(input: unknown): MediaItem[] {
  if (!Array.isArray(input)) return []
  const out: MediaItem[] = []
  let photoCount = 0
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Record<string, unknown>
    if (it.t === 'photo' && typeof it.url === 'string' && isStorageUrl(it.url)) {
      if (photoCount >= MAX_PHOTOS) continue
      photoCount++
      out.push({ t: 'photo', url: it.url })
    } else if (it.t === 'youtube' && typeof it.id === 'string' && /^[\w-]{11}$/.test(it.id)) {
      out.push({ t: 'youtube', id: it.id })
    } else if (it.t === 'link' && typeof it.url === 'string' && /^https?:\/\//i.test(it.url) && it.url.length <= 600) {
      out.push({
        t: 'link',
        url: it.url,
        title:       typeof it.title === 'string'       ? it.title.slice(0, 200)       : null,
        description: typeof it.description === 'string' ? it.description.slice(0, 400) : null,
        image:       typeof it.image === 'string' && /^https?:\/\//i.test(it.image) ? it.image.slice(0, 600) : null,
      })
    }
    if (out.length >= 6) break
  }
  return out
}

function isStorageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && url.includes('/storage/v1/object/public/') && url.length <= 600
}
