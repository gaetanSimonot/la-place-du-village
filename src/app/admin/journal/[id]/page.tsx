'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SpotlightPicker, { type SpotlightKind } from '@/components/SpotlightPicker'

interface JournalFull {
  id: string
  numero: number
  date_parution: string
  semaine_du: string
  semaine_au: string
  cover_kicker: string
  cover_titre: string
  cover_deck: string
  cover_image_url: string | null
  meteo: { temp?: number; vent?: string; conditions?: string } | null
  billet_titre: string | null
  billet_corps: string | null
  saviez_vous: string | null
  selection_event_ids: string[] | null
  selection_annonce_ids: string[] | null
  selection_bonplan_ids: string[] | null
  selection_article_id: string | null
  spotlight_etab_id: string | null
  spotlight_kind: SpotlightKind | null
  temps_lecture_min: number | null
  statut: 'brouillon' | 'publie'
  publie_at: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AdminJournalEditPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const router = useRouter()
  const [journal, setJournal] = useState<JournalFull | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/journal/${id}`, { headers: await authHeaders() })
    const d = await res.json()
    if (res.ok) setJournal(d.journal)
    else setError(d.error || 'Erreur chargement')
  }, [id])

  useEffect(() => { load() }, [load])

  const patch = async (partial: Partial<JournalFull>) => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/journal/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(partial),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur sauvegarde')
      setJournal(d.journal)
      setSavedHint('✓ Sauvegardé')
      setTimeout(() => setSavedHint(null), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const publier = async () => {
    if (!journal) return
    if (!confirm(`Publier le numéro ${journal.numero} ?`)) return
    await patch({ statut: 'publie' })
  }
  const depublier = async () => {
    if (!confirm('Dépublier ce numéro ?')) return
    await patch({ statut: 'brouillon' })
  }
  const supprimer = async () => {
    if (!confirm('Supprimer définitivement ce numéro ?')) return
    const res = await fetch(`/api/admin/journal/${id}`, { method: 'DELETE', headers: await authHeaders() })
    if (res.ok) router.push('/admin/journal')
  }

  if (!journal) {
    return (
      <main className="min-h-screen bg-creme p-6 font-inter">
        <p className="text-texte-doux">{error ?? 'Chargement…'}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-creme p-6 font-inter">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Link href="/admin/journal" className="text-[12px] font-semibold text-primary">← Journal</Link>
          <div className="flex items-center gap-2 text-[11px]">
            <span className={journal.statut === 'publie' ? 'rounded-full bg-primary px-3 py-1 font-bold text-white' : 'rounded-full border border-bord bg-white px-3 py-1 font-bold text-texte-doux'}>
              {journal.statut === 'publie' ? 'PUBLIÉ' : 'BROUILLON'}
            </span>
            {savedHint && <span className="text-primary">{savedHint}</span>}
            {saving && <span className="text-texte-doux">enregistrement…</span>}
          </div>
        </div>

        <h1 className="mt-3 font-serif text-[32px] leading-tight text-texte" style={{ letterSpacing: '-0.02em' }}>
          n°{journal.numero}
        </h1>
        <div className="text-[12px] text-texte-doux">
          Semaine du {journal.semaine_du} au {journal.semaine_au}
        </div>

        {error && (
          <div className="mt-4 rounded-[12px] border border-accent bg-[#FFF0E5] px-4 py-3 text-[13px] text-accent">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {journal.statut === 'brouillon'
            ? <button onClick={publier} className="rounded-[12px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white">Publier</button>
            : <button onClick={depublier} className="rounded-[12px] border border-bord bg-white px-5 py-2.5 text-[13px] font-bold text-texte">Dépublier</button>
          }
          <Link
            href={journal.statut === 'publie' ? `/journal/${journal.numero}` : `/admin/journal/${id}/preview`}
            className="rounded-[12px] border border-bord bg-white px-5 py-2.5 text-[13px] font-bold text-texte"
          >
            {journal.statut === 'publie' ? 'Voir la page publique →' : 'Aperçu →'}
          </Link>
          <button onClick={supprimer} className="rounded-[12px] border border-accent bg-white px-5 py-2.5 text-[13px] font-bold text-accent">
            Supprimer
          </button>
        </div>

        {/* Sections édition */}
        <Section title="Couverture">
          <Field label="Kicker" value={journal.cover_kicker} onSave={v => patch({ cover_kicker: v })} />
          <Field label="Titre" value={journal.cover_titre} onSave={v => patch({ cover_titre: v })} />
          <FieldArea label="Chapeau (deck)" rows={3} value={journal.cover_deck} onSave={v => patch({ cover_deck: v })} />
          <Field label="URL image cover" value={journal.cover_image_url ?? ''} onSave={v => patch({ cover_image_url: v || null })} placeholder="https://…" />
        </Section>

        <Section title="Le Billet">
          <Field label="Titre du billet" value={journal.billet_titre ?? ''} onSave={v => patch({ billet_titre: v })} />
          <FieldArea label="Corps du billet (markdown)" rows={10} value={journal.billet_corps ?? ''} onSave={v => patch({ billet_corps: v })} />
        </Section>

        <Section title="Le saviez-vous ?">
          <FieldArea label="Anecdote" rows={3} value={journal.saviez_vous ?? ''} onSave={v => patch({ saviez_vous: v })} />
        </Section>

        <Section title="Sélections (IDs, séparés par virgule)">
          <FieldList
            label="Événements"
            ids={journal.selection_event_ids ?? []}
            onSave={ids => patch({ selection_event_ids: ids })}
          />
          <FieldList
            label="Annonces"
            ids={journal.selection_annonce_ids ?? []}
            onSave={ids => patch({ selection_annonce_ids: ids })}
          />
          <FieldList
            label="Bons plans"
            ids={journal.selection_bonplan_ids ?? []}
            onSave={ids => patch({ selection_bonplan_ids: ids })}
          />
          <Field
            label="Article du numéro (UUID)"
            value={journal.selection_article_id ?? ''}
            onSave={v => patch({ selection_article_id: v || null })}
            placeholder="UUID de articles_journal"
          />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">
              Spotlight (établissement ou producteur)
            </span>
            <div className="mt-1">
              <SpotlightPicker
                value={journal.spotlight_etab_id
                  ? { kind: (journal.spotlight_kind ?? 'etablissement') as SpotlightKind, id: journal.spotlight_etab_id }
                  : null}
                onChange={v => patch({
                  spotlight_etab_id: v?.id ?? null,
                  spotlight_kind:    v?.kind ?? 'etablissement',
                })}
              />
            </div>
          </div>
        </Section>

        <Section title="Métadonnées">
          <Field
            label="Temps de lecture (min)"
            value={String(journal.temps_lecture_min ?? 5)}
            onSave={v => patch({ temps_lecture_min: parseInt(v, 10) || 5 })}
          />
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-[16px] border border-bord bg-white p-5">
      <h2 className="font-serif text-[18px] text-texte" style={{ letterSpacing: '-0.01em' }}>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, value, onSave, placeholder }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">{label}</span>
      <input
        type="text"
        value={local}
        placeholder={placeholder}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local) }}
        className="mt-1 w-full rounded-[10px] border border-bord bg-creme px-3 py-2 text-[14px] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}

function FieldArea({ label, value, onSave, rows = 4 }: { label: string; value: string; onSave: (v: string) => void; rows?: number }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">{label}</span>
      <textarea
        rows={rows}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local) }}
        className="mt-1 w-full rounded-[10px] border border-bord bg-creme px-3 py-2 text-[14px] leading-[1.5] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}

function FieldList({ label, ids, onSave }: { label: string; ids: string[]; onSave: (ids: string[]) => void }) {
  const [local, setLocal] = useState(ids.join(', '))
  useEffect(() => { setLocal(ids.join(', ')) }, [ids])
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">{label}</span>
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          const list = local.split(',').map(s => s.trim()).filter(Boolean)
          onSave(list)
        }}
        placeholder="uuid, uuid, …"
        className="mt-1 w-full rounded-[10px] border border-bord bg-creme px-3 py-2 font-mono text-[11px] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}
