import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Chaque territoire tient sa propre collection : l'admin de Pau ne doit pas
  // voir dix-huit numeros cevenols dans sa liste. Filtre pose uniquement si le
  // territoire est connu.
  const terr = await territoireDeLaRequete(req.url)
  let q = supabaseAdmin
    .from('journaux_hebdo')
    .select('id, numero, date_parution, semaine_du, semaine_au, cover_titre, cover_kicker, statut, generated_at, publie_at')
  if (terr) q = q.eq('territoire_id', terr.id)

  const { data, error } = await q
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

  /*
   * LA NUMEROTATION EST PROPRE AU TERRITOIRE.
   *
   * Comptee sur toute la table, le premier journal de Pau porterait le numero
   * 19 — on annoncerait une histoire qui n'a pas eu lieu. L'unicite en base
   * est (territoire_id, numero) depuis 2026-09-20.
   */
  const terr = await territoireDeLaRequete(req.url)
  let qLast = supabaseAdmin.from('journaux_hebdo').select('numero')
  if (terr) qLast = qLast.eq('territoire_id', terr.id)
  const { data: last } = await qLast
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
    ...(terr ? { territoire_id: terr.id } : {}),
  }

  const { data, error } = await supabaseAdmin
    .from('journaux_hebdo')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ journal: data })
}
