import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('id, numero, date_parution, semaine_du, semaine_au, cover_titre, cover_kicker, statut, generated_at, publie_at')
    .order('numero', { ascending: false })
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ journaux: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Création manuelle d'un brouillon vide. Le user remplira via la fiche.
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const { data: last } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  const numero = (last?.numero ?? 0) + 1

  const insert = {
    numero,
    date_parution: monday.toISOString().slice(0, 10),
    semaine_du:    monday.toISOString().slice(0, 10),
    semaine_au:    sunday.toISOString().slice(0, 10),
    cover_kicker:  'À LA UNE CETTE SEMAINE',
    cover_titre:   `Numéro ${numero} — Brouillon`,
    cover_deck:    '',
    statut:        'brouillon',
    temps_lecture_min: 5,
  }

  const { data, error } = await supabaseAdmin
    .from('journaux_hebdo')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ journal: data })
}
