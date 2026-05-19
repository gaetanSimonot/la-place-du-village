'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface JournalRow {
  id: string
  numero: number
  date_parution: string
  semaine_du: string
  semaine_au: string
  cover_titre: string
  cover_kicker: string
  statut: 'brouillon' | 'publie'
  generated_at: string
  publie_at: string | null
}

interface ArticleRow {
  id: string
  titre: string
  user_id: string | null
  statut: 'en_attente' | 'valide' | 'refuse' | 'publie'
  created_at: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AdminJournalPage() {
  const router = useRouter()
  const [journaux, setJournaux] = useState<JournalRow[]>([])
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const headers = await authHeaders()
    const [j, a] = await Promise.all([
      fetch('/api/admin/journal', { headers }).then(r => r.json()),
      fetch('/api/admin/articles', { headers }).then(r => r.json()),
    ])
    setJournaux(j.journaux ?? [])
    setArticles(a.articles ?? [])
  }

  useEffect(() => { load() }, [])

  const handleGenerate = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/journal/generate', {
        method: 'POST',
        headers: await authHeaders(),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur génération')
      router.push(`/admin/journal/${d.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateEmpty = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/journal', {
        method: 'POST',
        headers: await authHeaders(),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur création')
      router.push(`/admin/journal/${d.journal.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const brouillons = journaux.filter(j => j.statut === 'brouillon')
  const publies = journaux.filter(j => j.statut === 'publie')
  const articlesEnAttente = articles.filter(a => a.statut === 'en_attente')
  const articlesValides = articles.filter(a => a.statut === 'valide')

  return (
    <main className="min-h-screen bg-creme p-6 font-inter">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="text-[12px] font-semibold text-primary">← Admin</Link>
        <h1 className="mt-2 font-serif text-[32px] leading-tight text-texte" style={{ letterSpacing: '-0.02em' }}>
          Journal du Village
        </h1>
        <p className="mt-1 text-[13px] text-texte-doux">
          Gère les numéros hebdo : génération IA, édition, publication.
        </p>

        {error && (
          <div className="mt-4 rounded-[12px] border border-accent bg-[#FFF0E5] px-4 py-3 text-[13px] text-accent">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="rounded-[12px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Génération…' : '✨ Générer un brouillon (IA Sonnet)'}
          </button>
          <button
            type="button"
            onClick={handleCreateEmpty}
            disabled={busy}
            className="rounded-[12px] border border-bord bg-white px-5 py-2.5 text-[13px] font-bold text-texte disabled:opacity-50"
          >
            + Brouillon vide (manuel)
          </button>
        </div>

        {/* Articles en attente de modération */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-[20px] text-texte" style={{ letterSpacing: '-0.01em' }}>
              Articles en modération
            </h2>
            <span className="text-[12px] font-semibold text-texte-doux">
              {articlesEnAttente.length} en attente · {articlesValides.length} validés
            </span>
          </div>
          <ArticleList articles={articles} onChange={load} />
        </section>

        {/* Brouillons */}
        <section className="mt-10">
          <h2 className="font-serif text-[20px] text-texte" style={{ letterSpacing: '-0.01em' }}>
            Brouillons ({brouillons.length})
          </h2>
          <JournalList rows={brouillons} onDelete={load} />
        </section>

        {/* Publiés */}
        <section className="mt-10">
          <h2 className="font-serif text-[20px] text-texte" style={{ letterSpacing: '-0.01em' }}>
            Publiés ({publies.length})
          </h2>
          <JournalList rows={publies} onDelete={load} />
        </section>
      </div>
    </main>
  )
}

function JournalList({ rows, onDelete }: { rows: JournalRow[]; onDelete: () => void }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-[13px] text-texte-tres-doux">Aucun numéro.</p>
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce numéro ?')) return
    const res = await fetch(`/api/admin/journal/${id}`, { method: 'DELETE', headers: await authHeaders() })
    if (res.ok) onDelete()
  }

  return (
    <ul className="mt-3 space-y-2">
      {rows.map(r => (
        <li key={r.id} className="flex items-center gap-3 rounded-[12px] border border-bord bg-white px-4 py-3">
          <div className="font-serif text-[24px] text-primary leading-none">n°{r.numero}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-texte">{r.cover_titre}</div>
            <div className="text-[11px] text-texte-doux">
              {r.semaine_du} → {r.semaine_au}
              {r.publie_at && ` · publié le ${r.publie_at.slice(0, 10)}`}
            </div>
          </div>
          <Link
            href={`/admin/journal/${r.id}`}
            className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
          >
            Éditer
          </Link>
          <Link
            href={r.statut === 'publie' ? `/journal/${r.numero}` : `/admin/journal/${r.id}/preview`}
            className="rounded-lg border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte"
          >
            {r.statut === 'publie' ? 'Voir' : 'Aperçu'}
          </Link>
          <button
            type="button"
            onClick={() => handleDelete(r.id)}
            className="rounded-lg border border-accent bg-white px-3 py-1.5 text-[11px] font-bold text-accent"
          >
            Suppr
          </button>
        </li>
      ))}
    </ul>
  )
}

function ArticleList({ articles, onChange }: { articles: ArticleRow[]; onChange: () => void }) {
  if (articles.length === 0) {
    return <p className="mt-3 text-[13px] text-texte-tres-doux">Aucun article soumis.</p>
  }
  const handlePatch = async (id: string, statut: 'valide' | 'refuse') => {
    const res = await fetch(`/api/admin/articles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ statut }),
    })
    const data = await res.json().catch(() => ({}))
    if (statut === 'valide' && data.attachedTo) {
      alert(`✓ Article validé et publié dans le numéro n°${data.attachedTo.numero} (numéro en cours)`)
    }
    onChange()
  }
  return (
    <ul className="mt-3 space-y-2">
      {articles.map(a => (
        <li key={a.id} className="flex items-center gap-3 rounded-[12px] border border-bord bg-white px-4 py-3">
          <span
            className="rounded-full px-2 py-[3px] text-[9px] font-extrabold tracking-[0.06em] uppercase"
            style={{
              background: a.statut === 'en_attente' ? '#FFF0E5'
                       : a.statut === 'valide' ? '#E8F2EB'
                       : a.statut === 'publie' ? '#2D5A3D'
                       : '#F0EAE0',
              color: a.statut === 'en_attente' ? '#C84B2F'
                   : a.statut === 'valide' ? '#2D5A3D'
                   : a.statut === 'publie' ? '#FDFAF5'
                   : '#7A6A5A',
            }}
          >
            {a.statut.replace('_', ' ')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-texte">{a.titre}</div>
            <div className="text-[10px] text-texte-doux">{a.created_at.slice(0, 16).replace('T', ' ')}</div>
          </div>
          {a.statut === 'en_attente' && (
            <>
              <button onClick={() => handlePatch(a.id, 'valide')} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white">Valider</button>
              <button onClick={() => handlePatch(a.id, 'refuse')} className="rounded-lg border border-accent bg-white px-3 py-1.5 text-[11px] font-bold text-accent">Refuser</button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
