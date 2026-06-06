import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'

/**
 * GET /api/link-preview?url=...
 * Récupère les métadonnées OpenGraph d'un lien externe (titre, description,
 * image) pour afficher une carte de preview façon Facebook. Côté serveur
 * (obligatoire à cause du CORS).
 *
 * Sécurité : auth requise + rate-limit + garde anti-SSRF (pas d'IP privée /
 * localhost / scheme non-http) + timeout + taille de réponse bornée.
 */
export const dynamic = 'force-dynamic'

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '::1' || h === '0.0.0.0') return true
  // IPv4 privées / loopback / link-local
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

function metaTag(html: string, ...keys: string[]): string | null {
  for (const key of keys) {
    // property="og:title" content="..."  (ordre des attributs variable)
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i')
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i')
    const m = html.match(re1) ?? html.match(re2)
    if (m?.[1]) return decodeEntities(m[1].trim())
  }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
}

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const blocked = await rateLimit(ctx.userId, 'link_preview', ctx.plan, ctx.isAdmin)
  if (blocked) return blocked

  const raw = req.nextUrl.searchParams.get('url') ?? ''
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Scheme non autorisé' }, { status: 400 })
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: 'Hôte non autorisé' }, { status: 400 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaPlaceDuVillageBot/1.0)', Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 200 })
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) {
      return NextResponse.json({ url: target.toString(), title: null, description: null, image: null }, { status: 200 })
    }
    // Lit au plus ~250 Ko (le <head> est au début)
    const buf = await res.arrayBuffer()
    const html = new TextDecoder('utf-8').decode(buf.slice(0, 250_000))

    const title = metaTag(html, 'og:title', 'twitter:title')
      ?? (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null)
    const description = metaTag(html, 'og:description', 'twitter:description', 'description')
    let image = metaTag(html, 'og:image', 'twitter:image', 'twitter:image:src')
    // Résout les images relatives en absolu
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, target.toString()).toString() } catch { image = null }
    }

    return NextResponse.json({
      url:   target.toString(),
      title: title ? decodeEntities(title).slice(0, 200) : null,
      description: description ? description.slice(0, 400) : null,
      image,
    }, { status: 200 })
  } catch {
    return NextResponse.json({ url: target.toString(), title: null, description: null, image: null }, { status: 200 })
  } finally {
    clearTimeout(timer)
  }
}
