import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { BUCKET_AFFICHES, DOSSIER_VIGNETTES, cheminAffiche, cheminVignette } from '@/lib/vignettes'

/**
 * Fabrication des miniatures d'affiches (cf. lib/vignettes.ts).
 *
 * 400 px sur le petit côté, webp qualité 60. Mesuré le 13/10/2026 sur les 25
 * dernières affiches publiées : 339 ko en moyenne → 30 ko (480 px q70 en
 * donnait 41 : les affiches chargées de texte se compressent mal). Nette sur
 * la vignette de la liste comme sur les tuiles du Village (recadrées en
 * « cover »). Changer ces réglages : relancer le cron avec ?refaire=1.
 */
const COTE = 400
const QUALITE = 60

/** Fabrique la miniature d'une affiche. Lève en cas d'échec. */
export async function fabriquerVignette(chemin: string): Promise<number> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_AFFICHES).download(chemin)
  if (error || !data) throw new Error(`lecture ${chemin} : ${error?.message ?? 'vide'}`)
  const webp = await sharp(Buffer.from(await data.arrayBuffer()))
    .rotate()   // l'orientation EXIF des photos de téléphone
    .resize({ width: COTE, height: COTE, fit: 'outside', withoutEnlargement: true })
    .webp({ quality: QUALITE })
    .toBuffer()
  const { error: errEnvoi } = await supabaseAdmin.storage.from(BUCKET_AFFICHES).upload(cheminVignette(chemin), webp, {
    contentType: 'image/webp',
    // Une semaine et pas un an : une miniature regénérée (?refaire=1) garde
    // son chemin, il faut que les caches finissent par la reprendre.
    cacheControl: '604800',
    upsert: true,
  })
  if (errEnvoi) throw new Error(`écriture ${cheminVignette(chemin)} : ${errEnvoi.message}`)
  return webp.length
}

/** Noms des miniatures déjà présentes dans un dossier (pagination comprise). */
async function vignettesDuDossier(dossier: string): Promise<Set<string>> {
  const noms = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_AFFICHES)
      .list(DOSSIER_VIGNETTES + dossier, { limit: 1000, offset })
    if (error) throw new Error(`liste ${dossier} : ${error.message}`)
    for (const f of data ?? []) noms.add(f.name)
    if (!data || data.length < 1000) break
  }
  return noms
}

/** Les affiches d'événements qui n'ont pas encore de miniature (toutes avec `toutes`). */
export async function affichesSansVignette(toutes = false): Promise<string[]> {
  const urls = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('evenements')
      .select('image_url').not('image_url', 'is', null)
      .order('id').range(from, from + 999)
    if (error) throw new Error(`evenements : ${error.message}`)
    for (const e of data ?? []) if (e.image_url) urls.add(e.image_url)
    if (!data || data.length < 1000) break
  }
  const chemins = Array.from(new Set(Array.from(urls).map(cheminAffiche).filter((c): c is string => !!c)))
  if (toutes) return chemins

  const parDossier: Record<string, string[]> = {}
  for (const c of chemins) {
    const i = c.lastIndexOf('/')
    const dossier = i < 0 ? '' : c.slice(0, i)
    ;(parDossier[dossier] ??= []).push(c)
  }
  const manquants: string[] = []
  for (const [dossier, liste] of Object.entries(parDossier)) {
    const presents = await vignettesDuDossier(dossier)
    for (const c of liste) {
      const nom = cheminVignette(c).split('/').pop()!
      if (!presents.has(nom)) manquants.push(c)
    }
  }
  return manquants
}
