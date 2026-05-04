import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: producer, error } = await supabaseAdmin
    .from('producers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !producer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: rawProducts } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('producer_id', id)
    .eq('disponible', true)
    .order('categorie', { ascending: true })

  return NextResponse.json({ producer, products: rawProducts ?? [] })
}
