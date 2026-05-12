import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { mergeDraft, pickDraftableFields, shouldApplyDraft } from '@/lib/etab-drafts'

/**
 * GET — retourne la fiche fusionnée avec le draft du propriétaire si applicable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: etab, error } = await supabaseAdmin
    .from('etablissements')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  // Pas de proprio → version officielle pure
  if (!etab.user_id) return NextResponse.json({ etablissement: etab })

  // Charge le draft + le plan du proprio en parallèle
  const [draftRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from('etablissement_drafts')
      .select('user_id, fields')
      .eq('etablissement_id', id)
      .eq('user_id', etab.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('plan')
      .eq('user_id', etab.user_id)
      .maybeSingle(),
  ])

  const draft = draftRes.data
  const ownerPlan = profileRes.data?.plan

  const apply = draft && shouldApplyDraft({
    etabUserId: etab.user_id,
    draftUserId: draft.user_id,
    ownerPlan,
  })

  const finalEtab = apply ? mergeDraft(etab, draft.fields as Record<string, unknown>) : etab
  return NextResponse.json({ etablissement: finalEtab })
}

/**
 * PATCH — admin écrit dans la version officielle.
 * User propriétaire écrit dans son draft (visible publiquement si plan Pro/Max).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const body = await req.json()

  // Admin : écriture directe sur la version officielle (peut tout modifier)
  if (ctx.isAdmin) {
    const allowed = ['nom', 'type', 'commune', 'adresse', 'description_courte', 'description_longue', 'contact_tel', 'contact_whatsapp', 'site_web', 'horaires', 'photos', 'statut', 'plan', 'is_featured', 'note_google', 'lat', 'lng']
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
    const { error } = await supabaseAdmin.from('etablissements').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // User non-admin : doit être propriétaire
  if (etab.user_id !== ctx.userId) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  // Écriture dans son draft (merge avec l'existant)
  const newDraftFields = pickDraftableFields(body)
  if (Object.keys(newDraftFields).length === 0) {
    return NextResponse.json({ success: true })
  }

  const { data: existing } = await supabaseAdmin
    .from('etablissement_drafts')
    .select('fields')
    .eq('etablissement_id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle()

  const mergedFields = { ...(existing?.fields as Record<string, unknown> ?? {}), ...newDraftFields }

  const { error: upErr } = await supabaseAdmin
    .from('etablissement_drafts')
    .upsert({
      etablissement_id: id,
      user_id: ctx.userId,
      fields: mergedFields,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'etablissement_id,user_id' })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ success: true, draftSaved: true })
}
