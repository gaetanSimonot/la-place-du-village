'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import JournalAttachPicker from '@/components/JournalAttachPicker'
import SpotlightPicker, { type SpotlightValue } from '@/components/SpotlightPicker'
import BottomNavBar from '@/components/BottomNavBar'

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
  statut: 'brouillon' | 'en_attente' | 'valide' | 'refuse' | 'publie'
  journal_id: string | null
  photo_url: string | null
  created_at: string
  refus_motif: string | null
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
  // Spotlight choisi AVANT la generation (optionnel). Si null, le generator
  // utilise le pin featured_slots ou tire au hasard via RPC.
  const [spotlight, setSpotlight] = useState<SpotlightValue | null>(null)

  const load = useCallback(async () => {
    const headers = await authHeaders()
    const [j, a] = await Promise.all([
      fetch('/api/admin/journal', { headers }).then(r => r.json()),
      fetch('/api/admin/articles', { headers }).then(r => r.json()),
    ])
    setJournaux(j.journaux ?? [])
    setArticles(a.articles ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime refresh : refetch dès qu'un article ou un journal change en BDD
  useEffect(() => {
    const ch = supabase
      .channel('admin-journal-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles_journal' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journaux_hebdo' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const journauxByid: Record<string, JournalRow> = Object.fromEntries(journaux.map(j => [j.id, j]))

  const handleGenerate = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/journal/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        // Si l admin a choisi un spotlight avant -> envoye au generator
        // pour qu il soit cohérent avec la rédaction Claude. Sinon null
        // = comportement actuel (pin > random).
        body: JSON.stringify({ spotlight: spotlight ?? null }),
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
    <main className="min-h-screen bg-creme p-6 pb-28 font-inter">
      <div className="mx-auto max-w-4xl">
        <Link href="/profil" className="text-[12px] font-semibold text-primary">← Mon espace</Link>
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

        {/* Spotlight optionnel avant generation — si vide, le generator
            laisse le pin/random faire son travail. */}
        <div className="mt-6 rounded-[14px] border border-bord bg-white p-4">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-[13px] font-bold text-texte">
              Spotlight de ce numéro <span className="text-[11px] font-medium text-texte-doux">(optionnel)</span>
            </h3>
            {spotlight && (
              <button
                type="button"
                onClick={() => setSpotlight(null)}
                className="text-[11px] font-bold text-texte-doux underline"
              >
                Aléatoire
              </button>
            )}
          </div>
          <p className="m-0 mb-3 text-[11px] text-texte-doux">
            Choisis un établissement ou producteur à mettre en avant. Si tu ne choisis rien, l&apos;IA en prend un au hasard.
          </p>
          <SpotlightPicker value={spotlight} onChange={setSpotlight} />
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-3">
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
          <ArticleList articles={articles} journauxByid={journauxByid} onChange={load} />
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
      <BottomNavBar />
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

function ArticleList({
  articles, journauxByid, onChange,
}: {
  articles: ArticleRow[]
  journauxByid: Record<string, JournalRow>
  onChange: () => void
}) {
  const [attaching, setAttaching] = useState<ArticleRow | null>(null)

  if (articles.length === 0) {
    return <p className="mt-3 text-[13px] text-texte-tres-doux">Aucun article soumis.</p>
  }

  const handlePatch = async (id: string, statut: 'valide' | 'refuse') => {
    const promise = (async () => {
      const res = await fetch(`/api/admin/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ statut }),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json().catch(() => ({}))
      onChange()
      return data as { attachedTo?: { numero: number } }
    })()

    toast.promise(promise, {
      loading: statut === 'valide' ? 'Validation…' : 'Refus…',
      success: (data) => statut === 'valide'
        ? (data.attachedTo ? `Article publié dans le n°${data.attachedTo.numero}` : 'Article validé')
        : 'Article refusé',
      error: 'Erreur',
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement cet article ?')) return
    const res = await fetch(`/api/admin/articles/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    if (res.ok) onChange()
  }

  return (
    <>
      <ul className="mt-3 space-y-2">
        {articles.map(a => {
          const meta = STATUT_META[a.statut]
          const journal = a.journal_id ? journauxByid[a.journal_id] : null
          return (
            <li key={a.id} className="overflow-hidden rounded-[12px] border border-bord bg-white">
              <div className="flex items-center gap-3 p-3">
                {a.photo_url && (
                  <img src={a.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-[8px] object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-2 py-[2px] text-[9px] font-extrabold tracking-[0.06em] uppercase"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    {journal && (
                      <span className="rounded-full bg-[#E8F2EB] px-2 py-[2px] text-[9px] font-bold text-primary">
                        → n°{journal.numero}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-[13px] font-bold text-texte">{a.titre}</div>
                  <div className="text-[10px] text-texte-doux">{a.created_at.slice(0, 16).replace('T', ' ')}</div>
                  {a.refus_motif && a.statut === 'refuse' && (
                    <div className="mt-1 text-[10px] text-accent">Motif : {a.refus_motif}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-bordSoft bg-creme px-3 py-2">
                {a.statut === 'en_attente' && (
                  <>
                    <button onClick={() => handlePatch(a.id, 'valide')} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white">Valider</button>
                    <button onClick={() => handlePatch(a.id, 'refuse')} className="rounded-lg border border-accent bg-white px-3 py-1.5 text-[11px] font-bold text-accent">Refuser</button>
                  </>
                )}
                {(a.statut === 'valide' || a.statut === 'publie') && (
                  <button
                    onClick={() => setAttaching(a)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    {journal ? 'Changer numéro' : 'Attacher à un n°'}
                  </button>
                )}
                <Link
                  href={`/journal/articles/${a.id}/view`}
                  target="_blank"
                  className="rounded-lg border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte"
                >
                  Lire
                </Link>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="rounded-lg border border-accent bg-white px-3 py-1.5 text-[11px] font-bold text-accent"
                >
                  Suppr
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {attaching && (
        <JournalAttachPicker
          articleId={attaching.id}
          currentJournalId={attaching.journal_id}
          onAttached={() => { setAttaching(null); onChange() }}
          onDetached={() => { setAttaching(null); onChange() }}
          onClose={() => setAttaching(null)}
        />
      )}
    </>
  )
}

const STATUT_META: Record<ArticleRow['statut'], { label: string; bg: string; color: string }> = {
  brouillon:  { label: 'Brouillon',        bg: '#F0EAE0', color: '#7A6A5A' },
  en_attente: { label: 'En attente',       bg: '#FFF0E5', color: '#C84B2F' },
  valide:     { label: 'Validé',           bg: '#E8F2EB', color: '#2D5A3D' },
  refuse:     { label: 'Refusé',           bg: '#FBE9E7', color: '#C0392B' },
  publie:     { label: 'Publié',           bg: '#2D5A3D', color: '#FDFAF5' },
}
