import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('producers')
    .select('*, products(*)')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const products = (data.products ?? [])
    .filter((p: { disponible: boolean }) => p.disponible)
    .sort((a: { categorie: string }, b: { categorie: string }) => a.categorie.localeCompare(b.categorie))

  return NextResponse.json({ producer: data, products })
}
