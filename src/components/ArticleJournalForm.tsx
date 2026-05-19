'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { validateArticleInput, type ArticleJournal } from '@/lib/articles'
import { useHistoryTrap } from '@/contexts/HistoryTrapContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'

interface Props {
  /** Si fourni, on édite l'article (charge ses champs) */
  initial?: ArticleJournal | null
  onSaved?: (article: ArticleJournal, action: 'brouillon' | 'soumis') => void
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function ArticleJournalForm({ initial = null, onSaved }: Props) {
  const [titre, setTitre]         = useState(initial?.titre ?? '')
  const [corps, setCorps]         = useState(initial?.corps ?? '')
  const [photoUrl, setPhotoUrl]   = useState(initial?.photo_url ?? '')
  const [submitting, setSubmitting] = useState<'brouillon' | 'soumis' | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const submittedRef = useRef(false)

  // Dirty detection
  const dirty = !submittedRef.current && (
    titre.trim() !== (initial?.titre ?? '').trim() ||
    corps.trim() !== (initial?.corps ?? '').trim() ||
    (photoUrl || '') !== (initial?.photo_url ?? '')
  )
  const trap = useHistoryTrap()
  const { confirm } = useConfirm()
  useEffect(() => {
    return trap.registerGuard(async () => {
      if (!dirty) return true
      const ok = await confirm({
        title: 'Quitter sans enregistrer ?',
        message: 'Tes modifications ne seront pas sauvegardées (pense au bouton Brouillon).',
        confirmLabel: 'Quitter',
        cancelLabel: 'Continuer',
        destructive: true,
      })
      return ok
    })
  }, [trap, confirm, dirty])

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const userId = session.session?.user?.id
      if (!userId) throw new Error('Non connecté')
      // userId en premier segment du path : la policy storage Supabase
      // exige (storage.foldername(name))[1] = auth.uid()::text pour autoriser
      // l'INSERT sur le bucket 'annonces'.
      const path = `${userId}/articles/${Date.now()}-${file.name.replace(/\s+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('annonces').upload(path, file, {
        cacheControl: '3600', upsert: false,
      })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('annonces').getPublicUrl(path)
      setPhotoUrl(data.publicUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur upload')
    } finally {
      setUploading(false)
    }
  }

  const persist = async (action: 'brouillon' | 'soumis') => {
    setError(null)
    if (action === 'soumis') {
      const err = validateArticleInput({ titre, corps, photo_url: photoUrl || null })
      if (err) { setError(err); return }
    } else {
      if (!titre.trim()) { setError('Au moins un titre pour le brouillon'); return }
    }
    setSubmitting(action)
    const statutCible = action === 'soumis' ? 'en_attente' : 'brouillon'
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const body = JSON.stringify({ titre, corps, photo_url: photoUrl || null, statut: statutCible })
      const url = initial ? `/api/articles/${initial.id}` : '/api/articles'
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers, body })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      submittedRef.current = true
      onSaved?.(d.article as ArticleJournal, action)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); persist('soumis') }}
      className="space-y-4"
    >
      {/* Encart info */}
      <div className="rounded-[14px] border border-primary bg-[#E8F2EB] p-4 text-[12px] leading-[1.5] text-primary">
        <div className="font-bold">📰 Article du Journal du Village</div>
        <p className="mt-1 text-[12px] text-texte">
          Sauvegarde en brouillon quand tu veux, soumets quand c&apos;est prêt.
          Réservé aux abonnés Habitants &amp; Pro. Un seul article par numéro hebdo.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">Titre</span>
        <input
          type="text"
          value={titre}
          onChange={e => setTitre(e.target.value)}
          required
          maxLength={120}
          placeholder="Un titre accrocheur…"
          className="mt-1 w-full rounded-[12px] border border-bord bg-white px-4 py-3 text-[15px] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">
          Corps de l&apos;article ({corps.length} / 4000)
        </span>
        <textarea
          rows={14}
          value={corps}
          onChange={e => setCorps(e.target.value)}
          maxLength={4000}
          placeholder="Raconte… (markdown autorisé, double saut de ligne = nouveau paragraphe)"
          className="mt-1 w-full rounded-[12px] border border-bord bg-white px-4 py-3 text-[15px] leading-[1.6] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ fontFamily: 'Georgia, "Crimson Pro", serif' }}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">Photo (optionnel)</span>
        <input
          type="file"
          accept="image/*"
          onChange={handlePhoto}
          disabled={uploading}
          className="mt-1 block w-full text-[13px] text-texte file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white"
        />
        {uploading && <div className="mt-2 text-[11px] text-texte-doux">Upload en cours…</div>}
        {photoUrl && (
          <div className="mt-3 overflow-hidden rounded-[10px] border border-bord">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Aperçu" className="max-h-64 w-full object-cover" />
          </div>
        )}
      </label>

      {error && (
        <div className="rounded-[12px] border border-accent bg-[#FFF0E5] px-4 py-3 text-[13px] text-accent">
          {error}
        </div>
      )}

      {/* CTA double : brouillon + soumettre */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => persist('brouillon')}
          disabled={!!submitting || uploading}
          className="rounded-[14px] border border-bord bg-white py-3.5 text-[13px] font-bold text-texte disabled:opacity-50"
        >
          {submitting === 'brouillon' ? 'Enregistrement…' : 'Sauvegarder brouillon'}
        </button>
        <button
          type="submit"
          disabled={!!submitting || uploading}
          className="rounded-[14px] bg-primary py-3.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {submitting === 'soumis' ? 'Envoi…' : 'Soumettre'}
        </button>
      </div>
    </form>
  )
}
