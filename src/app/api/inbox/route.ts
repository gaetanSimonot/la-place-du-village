import { NextRequest, NextResponse } from 'next/server'
import { territoirePourIngestion } from '@/lib/territoires'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { processMessage } from '@/lib/processMessage'
import { validateImageUpload } from '@/lib/imageUpload'

/**
 * Même travail que /api/extract : extraction Claude puis, séquentiellement,
 * dédup + geocode + insert pour CHAQUE événement trouvé. Sur une affiche de
 * programme (13-20 événements), comptez ~5 s par événement — la valeur par
 * défaut de Vercel coupait bien avant la fin.
 *
 * Quand la route était coupée, le collector ne recevait pas de réponse, ne
 * mémorisait pas l'identifiant du message, et le renvoyait au cycle suivant.
 * Le serveur, lui, avait terminé le travail et payé Claude. Une même affiche
 * a ainsi été analysée 47 fois en deux jours.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * Le nom du fichier EST l'empreinte de l'image.
 *
 * Avant, chaque envoi générait un nom aléatoire : la même affiche renvoyée
 * dix fois occupait dix fichiers et devenait indétectable comme doublon.
 * Avec l'empreinte, deux envois identiques retombent sur le même chemin —
 * c'est ce qui rend le garde-fou ci-dessous possible sans toucher au schéma.
 */
function empreinteImage(base64: string): string {
  return createHash('sha256').update(base64).digest('hex').slice(0, 32)
}

async function uploadImage(base64: string, mimeType: string, empreinte: string): Promise<string | null> {
  const v = validateImageUpload(base64, mimeType)
  if (!v.ok) {
    console.warn('[inbox] image refusée:', v.error)
    return null
  }
  try {
    const filename = `inbox/${empreinte}.${v.ext}`
    const publicUrl = supabaseAdmin.storage.from('event-images').getPublicUrl(filename).data.publicUrl
    const { error } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filename, v.buffer, { contentType: v.mimeType, upsert: false })
    // Le fichier existe déjà : c'est exactement la même image, on réutilise
    // son URL au lieu d'en refaire une copie.
    if (error) {
      const dejaLa = /exist|duplicate|resource already/i.test(error.message)
      if (!dejaLa) {
        console.error('[inbox] upload image:', error.message)
        return null
      }
    }
    return publicUrl
  } catch (e) {
    console.error('[inbox] upload image exception:', e)
    return null
  }
}

/**
 * Ce message a-t-il DÉJÀ été analysé ?
 *
 * Garde-fou de facturation, volontairement côté serveur : il protège quel que
 * soit l'état du collector. Un message renvoyé — parce que l'appareil a coupé
 * avant la réponse, parce qu'il a été reposté, parce qu'un jour un autre
 * collector fera la même chose — ne doit pas repayer une extraction Claude et
 * N appels de dédoublonnage pour un résultat qu'on a déjà en base.
 *
 * Deux clés, par ordre de fiabilité :
 *   — l'empreinte de l'image, qui identifie une affiche sans ambiguïté ;
 *   — à défaut, le texte exact du même auteur, sur une fenêtre courte, parce
 *     qu'une annonce récurrente peut légitimement revenir un mois plus tard.
 */
async function dejaTraite(
  empreinte: string | null,
  contenu: string | null,
  auteur: string | null,
): Promise<{ id: string; statut: string } | null> {
  const depuis = (jours: number) =>
    new Date(Date.now() - jours * 86_400_000).toISOString()

  let q = supabaseAdmin
    .from('messages_entrants')
    .select('id, statut')
    .neq('statut', 'a_traiter')
    .limit(1)

  if (empreinte) {
    q = q.like('image_url', `%${empreinte}%`).gte('created_at', depuis(30))
  } else if (contenu && contenu.trim().length >= 40) {
    q = q.eq('contenu', contenu).gte('created_at', depuis(7))
    if (auteur) q = q.eq('auteur', auteur)
  } else {
    // Trop court pour être identifié de façon sûre : on laisse passer.
    return null
  }

  const { data, error } = await q.maybeSingle()
  if (error) {
    // Un garde-fou qui tombe en panne ne doit pas bloquer l'ingestion.
    console.warn('[inbox] contrôle de doublon indisponible:', error.message)
    return null
  }
  return data ?? null
}

export async function POST(req: NextRequest) {
  const waKey = req.headers.get('x-wa-key')
  if (!waKey || waKey !== process.env.WHATSAPP_API_KEY) {
    return NextResponse.json({ error: 'Clé API invalide' }, { status: 401 })
  }

  const body = await req.json()
  const { source = 'whatsapp', groupe, auteur, contenu, image, imageMimeType, image_url,
          // Deux champs apportes par le collecteur Facebook. Les collecteurs
          // WhatsApp et Signal ne les envoient pas : tout reste facultatif.
          territoire: slugTerritoire, permalien } = body

  if (!contenu?.trim() && !image && !image_url) {
    return NextResponse.json({ error: 'Contenu ou image requis' }, { status: 400 })
  }

  /*
   * LE TERRITOIRE DU POST. Le champ du payload prime ; sinon on regarde la
   * table des groupes ; sinon le territoire par defaut.
   *
   * Un slug inconnu est REFUSE et non rattrape en silence : un collecteur qui
   * se trompe de nom doit le voir tout de suite. Retomber sur le defaut
   * rangerait les posts de Pau dans les Cevennes, et ca ne se verrait que des
   * semaines plus tard.
   */
  const res = await territoirePourIngestion(slugTerritoire, source, groupe)
  if (!res.ok) {
    return NextResponse.json({
      error: `Territoire inconnu : « ${res.slugInconnu} ». Rien n'a ete enregistre.`,
      territoire_inconnu: res.slugInconnu,
    }, { status: 400 })
  }
  const territoire = res.territoire

  const empreinte = typeof image === 'string' && image ? empreinteImage(image) : null

  // Avant toute dépense : ce message a-t-il déjà été analysé ?
  const connu = await dejaTraite(empreinte, contenu ?? null, auteur ?? null)
  if (connu) {
    // `doublon` est le statut que le collector sait déjà lire : il mémorise
    // l'identifiant du message et cesse de le renvoyer.
    return NextResponse.json({
      ok: true,
      id: connu.id,
      statut: 'doublon',
      raison: 'Message déjà analysé',
      deja_traite: true,
      extraction: null,
      evenements_crees: 0,
      premier_evenement_id: null,
    })
  }

  let imageUrl: string | null = image_url ?? null
  if (image && empreinte && !imageUrl) {
    imageUrl = await uploadImage(image, imageMimeType || 'image/jpeg', empreinte)
  }

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('messages_entrants')
    .insert({
      source,
      groupe: groupe ?? null,
      ...(territoire ? { territoire_id: territoire.id } : {}),
      ...(typeof permalien === 'string' && permalien ? { permalien: permalien.slice(0, 500) } : {}),
      auteur: auteur ?? null,
      contenu: contenu ?? null,
      image_url: imageUrl,
      statut: 'a_traiter',
    })
    .select('id')
    .single()

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Erreur insertion message' }, { status: 500 })
  }

  const result = await processMessage(msg.id, contenu ?? null, imageUrl, source, image ?? null, imageMimeType ?? null, groupe ?? null, territoire)

  await supabaseAdmin.from('messages_entrants').update({
    statut: result.statut,
    raison: result.raison || null,
    extraction: result.extraction ?? null,
    evenement_id: result.premier_evenement_id ?? null,
  }).eq('id', msg.id)

  /*
   * On rend le TERRITOIRE ou le message a ete range.
   *
   * Le collecteur n'a aucun moyen de le savoir autrement : il envoie un slug
   * ou rien du tout, et c'est l'app qui tranche — table des groupes, defaut,
   * puis arbitrage geographique evenement par evenement. Sans cette reponse,
   * son journal ne peut que dire « envoye », jamais « range a Pau ».
   *
   * C'est la presomption au moment de l'accueil : un evenement precis peut
   * encore changer de ville si ses coordonnees le placent ailleurs.
   */
  return NextResponse.json({
    ok: true,
    id: msg.id,
    territoire: territoire ? { slug: territoire.slug, nom: territoire.nom } : null,
    ...result,
  })
}
