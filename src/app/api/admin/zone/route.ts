import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { geocodeWithGoogle } from '@/lib/extract'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete, oublierTerritoires } from '@/lib/territoires'
import { lireConfigs, ecrireConfig } from '@/lib/configTerritoire'

/**
 * LA ZONE D'UN TERRITOIRE — ses points d'ancrage, ses rayons, son cadrage.
 *
 * Tout y est désormais rapporté au territoire administré (`?territoire=<slug>`,
 * absent = celui par défaut). Sans ça l'écran mentait de deux façons : il
 * montrait les centres des deux villes mélangés, et il écrivait les rayons
 * dans `config` alors que l'accueil des événements lit ceux de `territoires`.
 * Régler « 45 km » pour Pau n'aurait rien changé du tout.
 *
 * Les rayons vivent donc dans la table `territoires`. Pour le territoire par
 * défaut, on continue d'écrire aussi les clés `config` d'origine : quelques
 * lectures s'en servent encore en repli, et elles doivent rester vraies.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const CADRAGE = ['carte_depart_lat', 'carte_depart_lng', 'carte_depart_zoom']

export async function GET(req: NextRequest) {
  // Garde admin : sans cette garde, n'importe quel user connecté pouvait
  // appeler ces routes (service_role bypass RLS).
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const terr = await territoireDeLaRequete(req.url)

  const requeteCentres = supabaseAdmin.from('zone_centres').select('*').order('created_at')
  const [centresRes, insertionRes, affichageRes, cadrage] = await Promise.all([
    terr ? requeteCentres.eq('territoire_id', terr.id) : requeteCentres,
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_insertion_km').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_affichage_km').single(),
    lireConfigs(CADRAGE, terr),
  ])

  const centre0 = (centresRes.data ?? [])[0] as { lat: number; lng: number } | undefined

  return NextResponse.json({
    territoire:        terr ? { id: terr.id, slug: terr.slug, nom: terr.nom } : null,
    centres:           centresRes.data ?? [],
    rayon_insertion:   terr?.rayon_insertion_km ?? parseInt(insertionRes.data?.value ?? '100', 10),
    rayon_affichage:   terr?.rayon_affichage_km ?? parseInt(affichageRes.data?.value ?? '50',  10),
    // Un territoire sans cadrage enregistré s'ouvre sur son premier centre :
    // mieux vaut ouvrir sur Pau que sur les Cévennes.
    carte_depart_lat:  parseFloat(cadrage.carte_depart_lat  ?? String(centre0?.lat ?? 43.5785)),
    carte_depart_lng:  parseFloat(cadrage.carte_depart_lng  ?? String(centre0?.lng ?? 3.8940)),
    carte_depart_zoom: parseInt(cadrage.carte_depart_zoom   ?? '11', 10),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { nom } = await req.json()
  if (!nom?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  const terr = await territoireDeLaRequete(req.url)

  const geo = await geocodeWithGoogle(nom, null, { indiceGeo: terr?.indice_geo })
  if (!geo.lat || !geo.lng) {
    return NextResponse.json({ error: `Village introuvable : ${nom}` }, { status: 404 })
  }

  // Le centre APPARTIENT au territoire. Un centre orphelin est ignoré par
  // l'arbitrage géographique : il ne ferait rien entrer nulle part.
  const { data, error } = await supabaseAdmin
    .from('zone_centres')
    .insert({ nom: nom.trim(), lat: geo.lat, lng: geo.lng, ...(terr ? { territoire_id: terr.id } : {}) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { rayon_insertion, rayon_affichage, carte_depart_lat, carte_depart_lng, carte_depart_zoom } = await req.json()
  const terr = await territoireDeLaRequete(req.url)

  const travaux: PromiseLike<unknown>[] = []

  // ── Les rayons : dans le territoire, qui en est la source de vérité ──
  const rayons: Record<string, number> = {}
  if (rayon_insertion != null) rayons.rayon_insertion_km = Math.max(1, Math.round(Number(rayon_insertion)))
  if (rayon_affichage != null) rayons.rayon_affichage_km = Math.max(1, Math.round(Number(rayon_affichage)))

  if (Object.keys(rayons).length && terr) {
    travaux.push(supabaseAdmin.from('territoires').update(rayons).eq('id', terr.id))
  }
  // Le territoire par défaut garde ses clés `config` à jour : elles servent
  // encore de repli là où le territoire n'est pas résolu.
  if (!terr || terr.par_defaut) {
    if (rayon_insertion != null) travaux.push(supabaseAdmin.from('config').upsert({ key: 'rayon_insertion_km', value: String(rayons.rayon_insertion_km) }, { onConflict: 'key' }))
    if (rayon_affichage != null) travaux.push(supabaseAdmin.from('config').upsert({ key: 'rayon_affichage_km', value: String(rayons.rayon_affichage_km) }, { onConflict: 'key' }))
  }

  // ── Le cadrage de la carte : éditorial, donc propre au territoire ──
  if (carte_depart_lat  != null) travaux.push(ecrireConfig('carte_depart_lat',  String(carte_depart_lat),  terr))
  if (carte_depart_lng  != null) travaux.push(ecrireConfig('carte_depart_lng',  String(carte_depart_lng),  terr))
  if (carte_depart_zoom != null) travaux.push(ecrireConfig('carte_depart_zoom', String(carte_depart_zoom), terr))

  await Promise.all(travaux)
  // Le cache des territoires tient 60 s. On l'oublie ici pour cette instance ;
  // les autres rattraperont d'elles-mêmes dans la minute.
  if (Object.keys(rayons).length) oublierTerritoires()
  return NextResponse.json({ ok: true })
}
