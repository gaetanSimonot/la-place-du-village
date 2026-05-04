import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { geocodeWithGoogle, calcStatut } from '@/lib/extract'
import { Categorie } from '@/lib/types'
import { checkDoublon } from '@/lib/checkDoublon'
import { checkZone } from '@/lib/checkZone'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function uploadImage(base64: string, mimeType: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg'
    const filename = `formulaire/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filename, buffer, { contentType: mimeType, upsert: false })
    if (error) { console.error('Upload error:', error.message); return null }
    const { data: { publicUrl } } = supabaseAdmin.storage.from('event-images').getPublicUrl(filename)
    return publicUrl
  } catch (e) { console.error('Upload exception:', e); return null }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      titre, description, date_debut, date_fin, heure,
      categorie, lieu_nom, lieu_adresse, commune, code_postal,
      lat: bodyLat, lng: bodyLng, place_id_google: bodyPlaceId, adresse: bodyAdresse,
      prix, contact, organisateurs, image, imageMimeType, image_position,
    } = body

    if (!titre?.trim()) {
      return NextResponse.json({ error: 'Le titre est requis' }, { status: 400 })
    }

    // Auth: identify user and check admin status
    let submittedBy: string | null = null
    let submittedByName: string | null = null
    let isUserSubmission = false
    let publishAt: string | null = null

    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Connexion requise pour soumettre un événement' }, { status: 401 })
    }
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (user) {
        const { data: adminRow } = await supabaseAdmin
          .from('admin_emails').select('email').eq('email', user.email ?? '').maybeSingle()
        if (adminRow) {
          submittedBy = user.id
        } else {
          // Regular user submission
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('display_name, banned, daily_post_count, last_post_date')
            .eq('id', user.id)
            .maybeSingle()

          if (profile?.banned) {
            return NextResponse.json({ error: 'Compte suspendu' }, { status: 403 })
          }

          submittedBy = user.id
          submittedByName = profile?.display_name ?? (user.email?.split('@')[0] ?? null)
          isUserSubmission = true

          const today = new Date()
          const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
          const sameDay = profile?.last_post_date === todayStr
          const dailyCount = sameDay ? (profile?.daily_post_count ?? 0) : 0

          if (dailyCount >= 5) {
            return NextResponse.json({ error: 'Limite journalière atteinte (5 événements par jour)' }, { status: 429 })
          }

          await supabaseAdmin.from('profiles').update({
            daily_post_count: dailyCount + 1,
            last_post_date: todayStr,
          }).eq('id', user.id)

          publishAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        }
      }
    }

    const imageUrl = image ? await uploadImage(image, imageMimeType || 'image/jpeg') : null

    let lieuId: string | null = null
    let geo = { place_id_google: null as string | null, lat: null as number | null, lng: null as number | null, adresse: null as string | null, approx: false }

    if (lieu_nom?.trim() || commune?.trim()) {
      if (bodyLat && bodyLng) {
        geo = { lat: bodyLat, lng: bodyLng, place_id_google: bodyPlaceId ?? null, adresse: bodyAdresse ?? lieu_adresse ?? null, approx: false }
      } else {
        geo = await geocodeWithGoogle(lieu_nom || null, commune || null)
      }

      const { data: lieu, error: lieuErr } = await supabaseAdmin
        .from('lieux')
        .insert({
          nom: lieu_nom,
          adresse: geo.adresse ?? lieu_adresse ?? null,
          lat: geo.lat,
          lng: geo.lng,
          place_id_google: geo.place_id_google,
          commune: commune ?? null,
          code_postal: code_postal ?? null,
        })
        .select('id')
        .single()

      if (lieuErr) throw new Error(`Erreur insertion lieu : ${lieuErr.message}`)
      lieuId = lieu.id
    }

    // Vérification zone géographique
    const zone = await checkZone(geo.lat, geo.lng)
    if (!zone.within) {
      return NextResponse.json({
        error: `Événement hors zone (${zone.distanceMin} km de ${zone.centreLePlusProche}, rayon configuré : ${zone.rayon} km)`,
        hors_zone: true,
      }, { status: 422 })
    }

    const baseStatut = calcStatut({
      categorie,
      date_debut: date_debut || null,
      description: description || null,
      hasGeo: !!geo.lat,
      commune: commune || null,
      adresse: geo.adresse ?? lieu_adresse ?? null,
    })

    // Check doublon IA (timeout 7s intégré dans checkDoublon)
    const check = await checkDoublon({
      titre,
      date_debut: date_debut || null,
      commune:    commune || null,
      lieu_nom:   lieu_nom || null,
      description: description || null,
    })

    let finalStatut: string
    let eventPublishAt: string | null = null

    if (isUserSubmission) {
      // doublon → archive, IA approuve → en_attente + auto-publish, sinon → a_verifier (admin review)
      if (check.doublon) {
        finalStatut = 'archive'
      } else if (check.publier) {
        finalStatut = 'en_attente'
        eventPublishAt = publishAt
      } else {
        finalStatut = 'a_verifier'
      }
    } else {
      finalStatut = check.doublon ? 'archive' : check.publier ? baseStatut : 'a_verifier'
    }

    const { data: evenement, error: evtErr } = await supabaseAdmin
      .from('evenements')
      .insert({
        titre,
        description: description || null,
        date_debut: date_debut || null,
        date_fin: date_fin || null,
        heure: heure || null,
        categorie: (categorie as Categorie) ?? 'autre',
        statut: finalStatut,
        lieu_id: lieuId,
        prix: prix || null,
        contact: contact || null,
        organisateurs: organisateurs || null,
        image_url: imageUrl,
        image_position: imageUrl ? (image_position || '50% 50%') : null,
        source: 'formulaire',
        submitted_by: submittedBy,
        submitted_by_name: submittedByName,
        publish_at: eventPublishAt,
      })
      .select()
      .single()

    if (evtErr) throw new Error(`Erreur insertion événement : ${evtErr.message}`)

    const message = isUserSubmission ? 'submitted' : undefined
    return NextResponse.json({ success: true, evenement, message })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
