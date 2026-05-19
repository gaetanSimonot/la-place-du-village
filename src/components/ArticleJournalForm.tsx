'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { validateArticleInput } from '@/lib/articles'

interface Props {
  onSuccess: (id: string) => void
}

export default function ArticleJournalForm({ onSuccess }: Props) {
  const [titre, setTitre] = useState('')
  const [corps, setCorps] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const userId = session.session?.user?.id
      if (!userId) throw new Error('Non connecté')
      const path = `articles/${userId}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const localErr = validateArticleInput({ titre, corps, photo_url: photoUrl || null })
    if (localErr) { setError(localErr); return }

    setSubmitting(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ titre, corps, photo_url: photoUrl || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur soumission')
      onSuccess(d.article.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Encart info */}
      <div className="rounded-[14px] border border-primary bg-[#E8F2EB] p-4 text-[12px] leading-[1.5] text-primary">
        <div className="font-bold">📰 Article du journal</div>
        <p className="mt-1 text-[12px] text-texte">
          Ton texte sera soumis à modération avant d&apos;être publié dans le prochain numéro du Journal du Village.
          Réservé aux abonnés Habitants &amp; Pro. 1 article par numéro maximum.
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
          rows={12}
          value={corps}
          onChange={e => setCorps(e.target.value)}
          required
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

      <button
        type="submit"
        disabled={submitting || uploading}
        className="w-full rounded-[14px] bg-primary py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
      >
        {submitting ? 'Envoi…' : "Soumettre l'article"}
      </button>
    </form>
  )
}
