import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { getPrompt } from '@/lib/prompts-ia'
import { safeJsonParse } from '@/lib/safeJsonParse'

/**
 * POST /api/radio/admin/transcrire — l'émission se lit elle-même.
 *
 * Deux temps, deux modèles, et c'est volontaire :
 *
 *   1. TRANSCRIRE. Whisper rend le texte de ce qui a été dit. Claude ne sait
 *      pas écouter un fichier son, il n'y a pas de raccourci.
 *   2. RECONNAÎTRE. Claude reçoit ce texte ET la liste des événements que
 *      l'agenda connaît pour ces deux semaines, et dit lesquels l'émission
 *      annonce. Il rend un identifiant quand il est sûr, sinon du texte.
 *
 * CE QU'IL NE TROUVE PAS, IL L'ÉCRIT QUAND MÊME. Une émission parle de ce
 * qu'elle veut ; refuser les rendez-vous absents de l'agenda donnerait une
 * liste qui ment sur le contenu du podcast. Ces lignes-là arrivent sans
 * identifiant et restent non cliquables — c'est exactement le cas prévu par
 * le modèle de données.
 *
 * LA TRANSCRIPTION EST GARDÉE. On relancera la reconnaissance — c'est en
 * relisant ce que le modèle a compris qu'on corrige — et la repayer à chaque
 * fois n'aurait pas de sens. `?force=1` refait le premier temps.
 *
 * RIEN N'EST ÉCRASÉ. Les mentions déjà là restent : le modèle ne peut pas
 * supprimer ce qu'un humain a corrigé à la main.
 */

export const maxDuration = 300
export const revalidate = 0
export const fetchCache = 'force-no-store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** La limite de l'API de transcription. Au-delà, elle refuse le fichier. */
const MAX_AUDIO = 24 * 1024 * 1024

/** Deux semaines de candidats : une émission annonce souvent la suivante. */
const JOURS_CANDIDATS = 13

/** Plafond de candidats envoyés au modèle — au-delà, le rappel se dégrade. */
const MAX_CANDIDATS = 180

interface RendezVous { id?: string | null; titre?: string; detail?: string }

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const emissionId = String(body?.emission_id ?? '')
  const force = body?.force === true
  if (!emissionId) return NextResponse.json({ error: 'emission_id manquant' }, { status: 400 })

  const { data: emission } = await supabaseAdmin
    .from('radio_emissions')
    .select('id, titre, audio_url, semaine_debut, transcription')
    .eq('id', emissionId).maybeSingle()
  if (!emission) return NextResponse.json({ error: 'Émission introuvable' }, { status: 404 })

  // ── 1. Transcrire ─────────────────────────────────────────────────────
  let texte = (emission.transcription as string | null) ?? ''

  if (!texte || force) {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Transcription indisponible (clé absente)' }, { status: 503 })
    }

    let audio: Blob
    try {
      const r = await fetch(emission.audio_url as string)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      audio = await r.blob()
    } catch (e) {
      return NextResponse.json(
        { error: `Le fichier audio n'a pas pu être téléchargé (${(e as Error).message})` },
        { status: 502 },
      )
    }

    if (audio.size > MAX_AUDIO) {
      // Le dire en clair, avec le chiffre : « trop gros » sans repère
      // n'indique pas quoi faire.
      return NextResponse.json({
        error: `Fichier trop lourd pour la transcription : ${(audio.size / 1048576).toFixed(0)} Mo pour 24 Mo maximum. Un MP3 mono à 64 kbit/s tient une heure dans cette limite.`,
      }, { status: 413 })
    }

    const form = new FormData()
    form.append('file', audio, 'emission.mp3')
    form.append('model', 'whisper-1')
    form.append('language', 'fr')
    // Les noms propres du territoire, soufflés au modèle : sans eux « Ganges »
    // devient « Gange » et « Sauve » devient « sauve ».
    form.append('prompt', 'Émission de radio locale dans les Cévennes. Communes citées : Ganges, Sauve, Le Vigan, Saint-Hippolyte-du-Fort, Saint-Bauzille-de-Putois, Laroque, Sumène, Quissac, Lasalle, Monoblet, Cazilhac.')

    const rt = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    })
    if (!rt.ok) {
      const detail = await rt.text().catch(() => '')
      return NextResponse.json({ error: `Transcription refusée (${rt.status}) ${detail.slice(0, 200)}` }, { status: 502 })
    }
    const jt = await rt.json()
    texte = String(jt?.text ?? '').trim()
    if (!texte) return NextResponse.json({ error: 'Transcription vide' }, { status: 502 })

    await supabaseAdmin.from('radio_emissions')
      .update({ transcription: texte, transcrit_le: new Date().toISOString() })
      .eq('id', emissionId)
  }

  // ── 2. Reconnaître ────────────────────────────────────────────────────
  const debut = String(emission.semaine_debut)
  const fin = new Date(Date.parse(`${debut}T12:00:00Z`) + JOURS_CANDIDATS * 86_400_000)
    .toISOString().slice(0, 10)

  const { data: candidats } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, date_fin, heure, lieux(nom, commune)')
    .eq('statut', 'publie')
    .lte('date_debut', fin)
    .or(`date_fin.gte.${debut},and(date_fin.is.null,date_debut.gte.${debut})`)
    .order('date_debut', { ascending: true })
    .limit(MAX_CANDIDATS)

  const liste = (candidats ?? []).map(e => {
    const l = e.lieux as { nom?: string; commune?: string } | null
    return {
      id: e.id as string,
      titre: e.titre as string,
      date: e.date_debut as string,
      lieu: l?.nom || l?.commune || null,
    }
  })

  const systeme = await getPrompt('radio_mentions')
  const reponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0,
    system: systeme,
    messages: [{
      role: 'user',
      content: `AGENDA CONNU (${liste.length} fiches) :\n${JSON.stringify(liste)}\n\nTRANSCRIPTION DE L'ÉMISSION :\n${texte.slice(0, 60_000)}`,
    }],
  })

  const brut = reponse.content.find(c => c.type === 'text')?.text ?? ''
  const parse = safeJsonParse<{ rendezvous?: RendezVous[] }>(brut)
  const trouves = Array.isArray(parse?.rendezvous) ? parse!.rendezvous! : []

  // ── 3. Écrire, sans rien écraser ──────────────────────────────────────
  const { data: deja } = await supabaseAdmin
    .from('radio_mentions').select('id, titre, evenement_id, ordre').eq('emission_id', emissionId)

  const idsConnus = new Set(liste.map(e => e.id))
  const dejaRattaches = new Set((deja ?? []).map(m => m.evenement_id).filter(Boolean) as string[])
  const dejaTitres = new Set((deja ?? []).map(m => (m.titre as string).toLowerCase().trim()))
  let ordre = Math.max(-1, ...(deja ?? []).map(m => (m.ordre as number) ?? 0)) + 1

  const aInserer: Record<string, unknown>[] = []
  let ignores = 0

  for (const rv of trouves) {
    const titre = String(rv.titre ?? '').trim()
    if (!titre) continue

    // Un identifiant inventé est pire qu'une ligne libre : il ferait pointer
    // la sélection vers un événement dont l'émission n'a pas parlé.
    const id = rv.id && idsConnus.has(rv.id) ? rv.id : null

    if (id ? dejaRattaches.has(id) : dejaTitres.has(titre.toLowerCase())) { ignores++; continue }

    aInserer.push({
      emission_id: emissionId,
      evenement_id: id,
      titre,
      detail: String(rv.detail ?? '').trim() || null,
      ordre: ordre++,
    })
    if (id) dejaRattaches.add(id); else dejaTitres.add(titre.toLowerCase())
  }

  if (aInserer.length) {
    const { error } = await supabaseAdmin.from('radio_mentions').insert(aInserer)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    caracteres: texte.length,
    candidats: liste.length,
    proposes: trouves.length,
    ajoutes: aInserer.length,
    rattaches: aInserer.filter(m => m.evenement_id).length,
    libres: aInserer.filter(m => !m.evenement_id).length,
    ignores,
  })
}
