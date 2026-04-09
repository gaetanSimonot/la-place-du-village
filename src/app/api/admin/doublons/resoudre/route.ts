import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from '@/lib/prompts-ia'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id_a, id_b } = body

  if (!action || !id_a || !id_b) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  try {
    if (action === 'ignorer') {
      // Les deux sont flaggés doublon_verifie = true, ne seront plus proposés
      await supabaseAdmin.from('evenements').update({ doublon_verifie: true }).in('id', [id_a, id_b])
      return NextResponse.json({ success: true })
    }

    if (action === 'archiver') {
      // id_b est archivé, id_a est conservé et flaggué vérifié
      await supabaseAdmin.from('evenements').update({ statut: 'archive' }).eq('id', id_b)
      await supabaseAdmin.from('evenements').update({ doublon_verifie: true }).eq('id', id_a)
      return NextResponse.json({ success: true })
    }

    if (action === 'fusionner') {
      // Récupère les deux fiches complètes
      const [{ data: evtA }, { data: evtB }] = await Promise.all([
        supabaseAdmin.from('evenements').select('*, lieux(*)').eq('id', id_a).single(),
        supabaseAdmin.from('evenements').select('*, lieux(*)').eq('id', id_b).single(),
      ])

      if (!evtA || !evtB) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })

      // Claude fusionne les deux
      let merged: Record<string, unknown> = {}
      try {
        const systemPrompt = await getPrompt('doublon_fusion')
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Événement A : ${JSON.stringify({ titre: evtA.titre, description: evtA.description, date_debut: evtA.date_debut, date_fin: evtA.date_fin, heure: evtA.heure, prix: evtA.prix, contact: evtA.contact, organisateurs: evtA.organisateurs })}

Événement B : ${JSON.stringify({ titre: evtB.titre, description: evtB.description, date_debut: evtB.date_debut, date_fin: evtB.date_fin, heure: evtB.heure, prix: evtB.prix, contact: evtB.contact, organisateurs: evtB.organisateurs })}`,
          }],
        })
        const raw    = response.content[0].type === 'text' ? response.content[0].text : '{}'
        const clean  = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        merged = JSON.parse(clean)
      } catch {
        // Si Claude fail, on garde juste l'événement A
        merged = {}
      }

      // Met à jour id_a avec la version fusionnée
      const update: Record<string, unknown> = { doublon_verifie: true }
      const fields = ['titre', 'description', 'date_debut', 'date_fin', 'heure', 'prix', 'contact', 'organisateurs']
      fields.forEach(f => { if (merged[f] !== undefined) update[f] = merged[f] })

      await supabaseAdmin.from('evenements').update(update).eq('id', id_a)
      // Archive id_b
      await supabaseAdmin.from('evenements').update({ statut: 'archive' }).eq('id', id_b)

      return NextResponse.json({ success: true, merged: update })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
