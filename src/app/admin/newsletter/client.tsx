'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/swr-fetchers'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import { makeBlock, starterBlocks, BLOCK_LABELS, type NewsletterBlock, type BlockType, type ContentItem } from '@/lib/newsletterBlocks'

type Audience = 'subscribers' | 'non_subscribers'
const LS_KEY = 'newsletter_draft_v1'
const ADD_TYPES: BlockType[] = ['header', 'text', 'events', 'promos', 'annonces', 'partenaires', 'journal', 'button', 'image', 'separator']

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a
}

export default function NewsletterAdminClient() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()

  const [counts, setCounts] = useState<{ subscribers: number; nonSubscribers: number } | null>(null)
  const [extra, setExtra] = useState<{ id: string; email: string }[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [audience, setAudience] = useState<Audience>('subscribers')
  const [subject, setSubject] = useState('')
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(starterBlocks())
  const [addOpen, setAddOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const dragIdx = useRef<number | null>(null)

  useEffect(() => { if (!authLoading && (!user || !isAdmin)) router.replace('/') }, [authLoading, user, isAdmin, router])

  // Brouillon localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.blocks)) setBlocks(d.blocks); if (d.subject) setSubject(d.subject) }
    } catch { /* noop */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ blocks, subject })) } catch { /* noop */ }
  }, [blocks, subject])

  const load = useCallback(async () => {
    const r = await authedFetch('/api/admin/newsletter').catch(() => null)
    if (r && r.ok) { const d = await r.json(); setCounts({ subscribers: d.subscribers, nonSubscribers: d.nonSubscribers }); setExtra(d.extra ?? []) }
  }, [])
  useEffect(() => { if (!authLoading && isAdmin) load() }, [authLoading, isAdmin, load])

  // Blocs
  const patchBlock = (id: string, patch: Partial<NewsletterBlock>) =>
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } as NewsletterBlock : b))
  const removeBlock = (id: string) => setBlocks(bs => bs.filter(b => b.id !== id))
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= blocks.length) return; setBlocks(bs => reorder(bs, i, j)) }
  const addBlock = (t: BlockType) => { setBlocks(bs => [...bs, makeBlock(t)]); setAddOpen(false) }

  // Abonnés manuels
  const addEmail = async () => {
    const e = newEmail.trim(); if (!e) return
    const r = await authedFetch('/api/admin/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error || 'Échec'); return }
    setNewEmail(''); toast.success('Ajouté aux abonnés'); load()
  }
  const removeEmail = async (email: string) => {
    const r = await authedFetch(`/api/admin/newsletter?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Retiré'); load() }
  }

  const recipientCount = counts ? (audience === 'subscribers' ? counts.subscribers : counts.nonSubscribers) : 0

  const send = async () => {
    if (!subject.trim()) { toast.error('Sujet requis'); return }
    if (blocks.length === 0) { toast.error('Ajoute au moins une section'); return }
    if (recipientCount === 0) { toast.error('Aucun destinataire'); return }
    const label = audience === 'subscribers' ? 'aux abonnés' : 'd’invitation aux non-abonnés'
    if (!confirm(`Envoyer ${label} à ${recipientCount} personne${recipientCount > 1 ? 's' : ''} ?`)) return
    setSending(true)
    try {
      const r = await authedFetch('/api/admin/newsletter/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience, subject: subject.trim(), blocks }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec de l’envoi')
      toast.success(`Envoyé à ${d.sent}/${d.total}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setSending(false) }
  }

  if (authLoading || !isAdmin) return <div className="flex min-h-[100dvh] items-center justify-center bg-creme"><div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>

  return (
    <div className="min-h-[100dvh] bg-creme font-inter" style={{ paddingBottom: 40 }}>
      <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(16px,env(safe-area-inset-top,16px))' }}>
        <button onClick={() => router.back()} aria-label="Retour" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="font-serif text-[21px] leading-none text-texte">Newsletter</div>
      </div>

      {/* Listes */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-5">
        {(['subscribers', 'non_subscribers'] as Audience[]).map(a => (
          <button key={a} onClick={() => setAudience(a)} className="rounded-2xl border-2 bg-white p-3 text-left" style={{ borderColor: audience === a ? 'var(--primary)' : '#EDE6DA' }}>
            <div className="text-[22px] font-extrabold text-texte">{a === 'subscribers' ? counts?.subscribers ?? '…' : counts?.nonSubscribers ?? '…'}</div>
            <div className="text-[12px] font-semibold text-texte-doux">{a === 'subscribers' ? 'Abonnés' : 'Non-abonnés (invitation)'}</div>
          </button>
        ))}
      </div>

      {/* Ajout manuel */}
      <div className="px-4 pt-3">
        <div className="flex gap-2">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addEmail() }} type="email" placeholder="Ajouter un email aux abonnés (test)…"
            className="min-w-0 flex-1 rounded-xl border bg-white px-3.5 py-2.5 text-[13px] outline-none" style={{ borderColor: '#EDE6DA' }} />
          <button onClick={addEmail} className="shrink-0 rounded-xl bg-primary px-4 text-[13px] font-bold text-white">Ajouter</button>
        </div>
        {extra.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extra.map(x => (
              <span key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-bord bg-white px-2.5 py-1 text-[11px] text-texte">{x.email}<button onClick={() => removeEmail(x.email)} className="font-bold text-texte-doux">✕</button></span>
            ))}
          </div>
        )}
      </div>

      {/* Sujet */}
      <div className="px-4 pt-4">
        <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Objet de l’email</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Cette semaine au village 🌿"
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-[14px] text-texte outline-none" style={{ borderColor: '#EDE6DA' }} />
      </div>

      {/* Sections */}
      <div className="px-4 pt-4">
        <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Sections (glisse ⠿ pour réordonner)</label>
        <div className="flex flex-col gap-2">
          {blocks.map((b, i) => (
            <div key={b.id}
              draggable
              onDragStart={() => { dragIdx.current = i }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragIdx.current !== null && dragIdx.current !== i) setBlocks(bs => reorder(bs, dragIdx.current!, i)); dragIdx.current = null }}
              className="rounded-2xl border bg-white" style={{ borderColor: '#EDE6DA' }}>
              <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: '#F2ECE2' }}>
                <span className="cursor-grab text-texte-doux">⠿</span>
                <span className="flex-1 text-[12px] font-bold text-texte">{BLOCK_LABELS[b.type]}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-texte-doux disabled:opacity-30">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="px-1 text-texte-doux disabled:opacity-30">↓</button>
                <button onClick={() => removeBlock(b.id)} className="px-1 font-bold text-[#C0392B]">✕</button>
              </div>
              <div className="p-3">
                <BlockEditor block={b} patch={p => patchBlock(b.id, p)} />
              </div>
            </div>
          ))}
        </div>

        {/* Ajouter une section */}
        <div className="relative mt-2">
          <button onClick={() => setAddOpen(o => !o)} className="w-full rounded-2xl border-2 border-dashed py-3 text-[13px] font-bold text-texte-doux" style={{ borderColor: '#D8CFC2' }}>+ Ajouter une section</button>
          {addOpen && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-lg" style={{ borderColor: '#EDE6DA' }}>
              {ADD_TYPES.map(t => (
                <button key={t} onClick={() => addBlock(t)} className="block w-full border-b px-4 py-2.5 text-left text-[13px] text-texte" style={{ borderColor: '#F2ECE2' }}>{BLOCK_LABELS[t]}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Envoi */}
      <div className="px-4 pt-5">
        <button onClick={send} disabled={sending} className="flex w-full items-center justify-center rounded-2xl border-none bg-primary py-3.5 text-[14px] font-extrabold text-white disabled:opacity-60">
          {sending ? 'Envoi…' : `Envoyer à ${recipientCount} destinataire${recipientCount > 1 ? 's' : ''}`}
        </button>
        <p className="mt-2 text-center text-[11px] text-texte-doux">Depuis lettre@laplaceduvillage.app · brouillon sauvegardé automatiquement</p>
      </div>
    </div>
  )
}

// ── Éditeur d'un bloc ───────────────────────────────────────────────────────
function BlockEditor({ block: b, patch }: { block: NewsletterBlock; patch: (p: Partial<NewsletterBlock>) => void }) {
  if (b.type === 'header') return (
    <div className="flex flex-col gap-2">
      <ImageField label="Image (optionnelle)" url={b.imageUrl ?? ''} onChange={url => patch({ imageUrl: url } as Partial<NewsletterBlock>)} />
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre" className={fieldCls} />
      <input value={b.sousTitre} onChange={e => patch({ sousTitre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Sous-titre" className={fieldCls} />
    </div>
  )
  if (b.type === 'text') return (
    <textarea value={b.texte} onChange={e => patch({ texte: e.target.value } as Partial<NewsletterBlock>)} rows={4} placeholder="Ton texte…" className={fieldCls + ' resize-none'} />
  )
  if (b.type === 'button') return (
    <div className="flex flex-col gap-2">
      <input value={b.label} onChange={e => patch({ label: e.target.value } as Partial<NewsletterBlock>)} placeholder="Texte du bouton" className={fieldCls} />
      <input value={b.href} onChange={e => patch({ href: e.target.value } as Partial<NewsletterBlock>)} placeholder="Lien (https://…)" className={fieldCls} />
    </div>
  )
  if (b.type === 'image') return <ImageField label="Image" url={b.url} onChange={url => patch({ url } as Partial<NewsletterBlock>)} />
  if (b.type === 'separator') return <p className="text-center text-[12px] text-texte-doux">— ligne de séparation —</p>
  if (b.type === 'journal') return (
    <div className="flex flex-col gap-2">
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
      <ContentPreview type="journal" />
    </div>
  )
  if (b.type === 'partenaires') return (
    <div className="flex flex-col gap-2">
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
      <PartnerPicker ids={b.ids} onChange={ids => patch({ ids } as Partial<NewsletterBlock>)} />
    </div>
  )
  // events / promos / annonces
  return (
    <div className="flex flex-col gap-2">
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
      <label className="flex items-center gap-2 text-[12px] text-texte-doux">Nombre :
        <input type="number" min={1} max={8} value={b.count} onChange={e => patch({ count: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) } as Partial<NewsletterBlock>)} className="w-16 rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: '#EDE6DA' }} />
      </label>
      <ContentPreview type={b.type} count={b.count} />
    </div>
  )
}

const fieldCls = 'w-full rounded-xl border bg-white px-3 py-2 text-[13.5px] text-texte outline-none'

// ── Aperçu live d'un bloc contenu ───────────────────────────────────────────
function ContentPreview({ type, count, ids }: { type: string; count?: number; ids?: string[] }) {
  const [items, setItems] = useState<ContentItem[] | null>(null)
  useEffect(() => {
    const params = new URLSearchParams({ type })
    if (count) params.set('count', String(count))
    if (ids?.length) params.set('ids', ids.join(','))
    authedFetch(`/api/admin/newsletter/content?${params}`).then(async r => { if (r.ok) setItems((await r.json()).items ?? []) }).catch(() => setItems([]))
  }, [type, count, ids])
  if (items === null) return <p className="text-[11px] text-texte-doux">Chargement de l’aperçu…</p>
  if (items.length === 0) return <p className="rounded-lg bg-[#FBF3E6] px-3 py-2 text-[11px] text-[#A06A2E]">Aucun contenu trouvé pour cette section (rien ne sera affiché).</p>
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: '#F2ECE2' }}>
          {it.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
            : <span className="h-8 w-8 shrink-0 rounded bg-[#EDE6DA]" />}
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-texte">{it.title}</span>
            {it.sub && <span className="block truncate text-[10.5px] text-texte-doux">{it.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Picker partenaires (recherche établissements / producteurs) ─────────────
function PartnerPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ value: string; label: string; sub: string | null; image: string | null }[]>([])
  const [selected, setSelected] = useState<Record<string, { label: string; image: string | null }>>({})

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      authedFetch(`/api/admin/newsletter/content?type=search&q=${encodeURIComponent(q.trim())}`).then(async r => { if (r.ok) setResults((await r.json()).results ?? []) }).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const add = (v: string, label: string, image: string | null) => { if (!ids.includes(v)) onChange([...ids, v]); setSelected(s => ({ ...s, [v]: { label, image } })); setQ(''); setResults([]) }
  const remove = (v: string) => onChange(ids.filter(x => x !== v))

  return (
    <div className="flex flex-col gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un commerce / producteur…" className={fieldCls} />
      {results.length > 0 && (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: '#EDE6DA' }}>
          {results.map(r => (
            <button key={r.value} onClick={() => add(r.value, r.label, r.image)} className="block w-full border-b px-3 py-2 text-left text-[12.5px] text-texte" style={{ borderColor: '#F2ECE2' }}>{r.label}{r.sub ? ` · ${r.sub}` : ''}</button>
          ))}
        </div>
      )}
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map(v => (
            <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-bord bg-white px-2.5 py-1 text-[11px] text-texte">{selected[v]?.label ?? v}<button onClick={() => remove(v)} className="font-bold text-texte-doux">✕</button></span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Champ image (upload) ────────────────────────────────────────────────────
function ImageField({ label, url, onChange }: { label: string; url: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const blob = await compressImage(file, { maxDim: 1280, quality: 0.85 })
      const up = await uploadViaSignedUrl({ file: blob, kind: 'admin-edit' })
      onChange(up.publicUrl)
    } catch { toast.error('Upload échoué') } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center gap-2">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="h-12 w-12 rounded-lg object-cover" />
        : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#EDE6DA] text-[10px] text-texte-doux">img</span>}
      <button onClick={() => ref.current?.click()} disabled={busy} className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold text-texte" style={{ borderColor: '#EDE6DA' }}>{busy ? '…' : (url ? 'Changer' : label)}</button>
      {url && <button onClick={() => onChange('')} className="text-[12px] text-texte-doux">retirer</button>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
    </div>
  )
}
