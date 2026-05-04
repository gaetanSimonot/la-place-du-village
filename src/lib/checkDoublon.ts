import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'
import { getPrompt } from './prompts-ia'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface DoublonCheckInput {
  titre: string
  date_debut: string | null
  commune: string | null
  lieu_nom: string | null
  description: string | null
}

export interface DoublonCheckResult {
  doublon: boolean
  doublon_id: string | null
  publier: boolean
  raison: string
  infos_manquantes: string[]
}

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function checkDoublon(newEvent: DoublonCheckInput): Promise<DoublonCheckResult> {
  const safe: DoublonCheckResult = {
    doublon: false, doublon_id: null, publier: true,
    raison: 'Aucun candidat à comparer', infos_manquantes: [],
  }

  // Pas de commune ni de date → on ne peut pas comparer, on accepte
  if (!newEvent.commune && !newEvent.date_debut) return safe

  // Fetch events récents de la même commune ±7 jours
  let query = supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, description, heure, lieux(nom, commune)')
    .not('statut', 'in', '("archive","rejete")')
    .order('created_at', { ascending: false })
    .limit(60)

  if (newEvent.date_debut) {
    const d = new Date(newEvent.date_debut + 'T00:00:00')
    const from = formatDateOnly(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
    const to   = formatDateOnly(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
    query = query.gte('date_debut', from).lte('date_debut', to)
  }

  const { data } = await query
  const candidates = (data ?? [])
    .filter(e => {
      if (!newEvent.commune) return true
      const c = (e.lieux as { commune?: string } | null)?.commune ?? ''
      return c.toLowerCase() === newEvent.commune.toLowerCase()
    })
    .slice(0, 10)

  if (candidates.length === 0) return safe

  // Appel Claude Haiku avec timeout 7s (Vercel Hobby = 10s max)
  let response
  try {
    const systemPrompt = await getPrompt('doublon_check')
    const claudeCall = anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Nouvel événement :
${JSON.stringify({ titre: newEvent.titre, date: newEvent.date_debut, commune: newEvent.commune, lieu: newEvent.lieu_nom, description: newEvent.description?.slice(0, 200) })}

Événements existants dans la même zone/période :
${JSON.stringify(candidates.map(e => ({ id: e.id, titre: e.titre, date: e.date_debut })))}`,
      }],
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 7000)
    )
    response = await Promise.race([claudeCall, timeout])
  } catch {
    // Timeout ou erreur Claude → a_verifier (prudent)
    return { doublon: false, doublon_id: null, publier: false, raison: 'Vérification indisponible — à vérifier manuellement', infos_manquantes: [] }
  }

  try {
    const raw   = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(clean)
    return {
      doublon:          !!result.doublon,
      doublon_id:       result.doublon_id ?? null,
      publier:          result.doublon ? false : (result.publier ?? true),
      raison:           result.raison ?? '',
      infos_manquantes: Array.isArray(result.infos_manquantes) ? result.infos_manquantes : [],
    }
  } catch {
    return { ...safe, raison: 'Réponse Claude non parseable — accepté par défaut' }
  }
}
