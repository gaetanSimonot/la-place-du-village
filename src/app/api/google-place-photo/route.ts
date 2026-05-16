import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy vers Google Places Photo API.
 *
 * Le client appelle /api/google-place-photo?ref=<photo_reference>&maxwidth=800
 * → on redirige (302) vers l'URL Google avec la clé serveur, sans exposer la clé.
 *
 * Note : Google Place Photo retourne un 302 vers le CDN final. On laisse le
 * browser suivre la redirection. La photo est ensuite cachée par le browser.
 *
 * Pour usage permanent (référencement de fiche), il vaut mieux télécharger
 * et uploader dans Supabase Storage. Cet endpoint sert juste à l'aperçu.
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  const maxw = req.nextUrl.searchParams.get('maxwidth') ?? '800'
  if (!ref) return NextResponse.json({ error: 'ref requis' }, { status: 400 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/photo')
  url.searchParams.set('photoreference', ref)
  url.searchParams.set('maxwidth', maxw)
  url.searchParams.set('key', process.env.GOOGLE_PLACES_KEY!)

  return NextResponse.redirect(url.toString(), { status: 302 })
}
