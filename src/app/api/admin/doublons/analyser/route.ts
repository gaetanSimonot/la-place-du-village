import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from '@/lib/prompts-ia'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface PaireSuspecte {
  id_a: string
  titre_a: string
  date_a: string | null
  commune_a: string | null
  desc_a: string | null
  id_b: string
  titre_b: string
  date_b: string | null
  commune_b: string | null
  desc_b: string | null
  raison: string
}

export async function POST() {
  // Récupère tous les publiés non déjà vérifiés
  const { data: events, error } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, description, doublon_verifie, lieux(nom, commune)')
    .eq('statut', 'publie')
    .eq('doublon_verifie', false)
    .order('date_debut', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!events || events.length < 2) return NextResponse.json({ paires: [] })

  // Prépare le payload pour Claude
  const eventsFlat = events.map(e => ({
    id:      e.id,
    titre:   e.titre,
    date:    e.date_debut,
    commune: (e.lieux as { commune?: string } | null)?.commune ?? null,
    desc:    (e.description ?? '').slice(0, 150),
  }))

  const paires: PaireSuspecte[] = []

  // Batch de 30 événements envoyés à Claude
  const BATCH = 30
  for (let i = 0; i < eventsFlat.length; i += BATCH) {
    const batch = eventsFlat.slice(i, i + BATCH)
    if (batch.length < 2) break

    let response
    try {
      const systemPrompt = await getPrompt('doublon_batch')
      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: JSON.stringify(batch),
        }],
      })
    } catch {
      continue
    }

    try {
      const raw    = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const clean  = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const result = JSON.parse(clean)

      for (const p of (result.paires ?? [])) {
        const evtA = eventsFlat.find(e => e.id === p.id_a)
        const evtB = eventsFlat.find(e => e.id === p.id_b)
        if (!evtA || !evtB) continue
        paires.push({
          id_a: evtA.id, titre_a: evtA.titre, date_a: evtA.date, commune_a: evtA.commune, desc_a: evtA.desc,
          id_b: evtB.id, titre_b: evtB.titre, date_b: evtB.date, commune_b: evtB.commune, desc_b: evtB.desc,
          raison: p.raison,
        })
      }
    } catch {
      // Si Claude n'est pas parseable, on skip le batch
    }
  }

  return NextResponse.json({ paires, total_analyses: events.length })
}
