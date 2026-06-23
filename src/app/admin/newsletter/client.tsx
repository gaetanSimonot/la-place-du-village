'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/swr-fetchers'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import { makeBlock, starterBlocks, BLOCK_LABELS, type NewsletterBlock, type BlockType } from '@/lib/newsletterBlocks'

type Audience = 'subscribers' | 'non_subscribers'
const LS_KEY = 'newsletter_draft_v2'
const ADD_TYPES: BlockType[] = ['header', 'text', 'events', 'promos', 'annonces', 'partenaires', 'journal', 'button', 'image', 'separator']
interface Invite { titre: string; message: string; imageUrl: string }

function reorder<T>(arr: T[], from: number, to: number): T[] { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a }
const fieldCls = 'w-full rounded-xl border bg-white px-3 py-2 text-[13.5px] text-texte outline-none'

export default function NewsletterAdminClient() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()

  const [counts, setCounts] = useState<{ subscribers: number; nonSubscribers: number } | null>(null)
  const [extra, setExtra] = useState<{ id: string; email: string }[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [audience, setAudience] = useState<Audience>('subscribers')
  const [subject, setSubject] = useState('')
  const [inviteSubject, setInviteSubject] = useState('Rejoignez la newsletter de La Place du Village')
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(starterBlocks())
  const [invite, setInvite] = useState<Invite>({ titre: 'La Place du Village', message: "Une fois par semaine, le meilleur du village : nouveaux événements, annonces à ne pas manquer et actus locales.\n\nAbonnez-vous en un clic ci-dessous, c'est gratuit !", imageUrl: '' })
  const [addOpen, setAddOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const dragIdx = useRef<number | null>(null)

  useEffect(() => { if (!authLoading && (!user || !isAdmin)) router.replace('/') }, [authLoading, user, isAdmin, router])

  useEffect(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.blocks)) setBlocks(d.blocks); if (d.subject) setSubject(d.subject); if (d.invite) setInvite(d.invite); if (d.inviteSubject) setInviteSubject(d.inviteSubject) } } catch { /* noop */ }
  }, [])
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ blocks, subject, invite, inviteSubject })) } catch { /* noop */ } }, [blocks, subject, invite, inviteSubject])

  const load = useCallback(async () => {
    const r = await authedFetch('/api/admin/newsletter').catch(() => null)
    if (r && r.ok) { const d = await r.json(); setCounts({ subscribers: d.subscribers, nonSubscribers: d.nonSubscribers }); setExtra(d.extra ?? []) }
  }, [])
  useEffect(() => { if (!authLoading && isAdmin) load() }, [authLoading, isAdmin, load])

  // Aperçu email live (debounce)
  useEffect(() => {
    const t = setTimeout(async () => {
      const mode = audience === 'subscribers' ? 'newsletter' : 'invite'
      const r = await authedFetch('/api/admin/newsletter/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, blocks, invite }) }).catch(() => null)
      if (r && r.ok) setPreviewHtml((await r.json()).html ?? '')
    }, 450)
    return () => clearTimeout(t)
  }, [audience, blocks, invite])

  const patchBlock = (id: string, patch: Partial<NewsletterBlock>) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } as NewsletterBlock : b))
  const removeBlock = (id: string) => setBlocks(bs => bs.filter(b => b.id !== id))
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= blocks.length) return; setBlocks(bs => reorder(bs, i, j)) }
  const addBlock = (t: BlockType) => { setBlocks(bs => [...bs, makeBlock(t)]); setAddOpen(false) }

  const addEmail = async () => {
    const e = newEmail.trim(); if (!e) return
    const r = await authedFetch('/api/admin/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error || 'Échec'); return }
    setNewEmail(''); toast.success('Ajouté'); load()
  }
  const removeEmail = async (email: string) => { const r = await authedFetch(`/api/admin/newsletter?email=${encodeURIComponent(email)}`, { method: 'DELETE' }); if (r.ok) { toast.success('Retiré'); load() } }

  const recipientCount = counts ? (audience === 'subscribers' ? counts.subscribers : counts.nonSubscribers) : 0

  const send = async () => {
    const subj = (audience === 'subscribers' ? subject : inviteSubject).trim()
    if (!subj) { toast.error('Objet requis'); return }
    if (recipientCount === 0) { toast.error('Aucun destinataire'); return }
    if (!confirm(`Envoyer à ${recipientCount} personne${recipientCount > 1 ? 's' : ''} ?`)) return
    setSending(true)
    try {
      const r = await authedFetch('/api/admin/newsletter/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audience, subject: subj, blocks, invite }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec')
      toast.success(`Envoyé à ${d.sent}/${d.total}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setSending(false) }
  }

  if (authLoading || !isAdmin) return <div className="flex min-h-[100dvh] items-center justify-center bg-creme"><div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>

  return (
    <div className="min-h-[100dvh] bg-creme font-inter" style={{ paddingBottom: 40 }}>
      <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(16px,env(safe-area-inset-top,16px))' }}>
        <button onClick={() => router.back()} aria-label="Retour" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
        <div className="font-serif text-[21px] leading-none text-texte">Newsletter</div>
      </div>

      {/* Onglets liste/destinataires */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-5">
        {(['subscribers', 'non_subscribers'] as Audience[]).map(a => (
          <button key={a} onClick={() => setAudience(a)} className="rounded-2xl border-2 bg-white p-3 text-left" style={{ borderColor: audience === a ? 'var(--primary)' : '#EDE6DA' }}>
            <div className="text-[22px] font-extrabold text-texte">{a === 'subscribers' ? counts?.subscribers ?? '…' : counts?.nonSubscribers ?? '…'}</div>
            <div className="text-[12px] font-semibold text-texte-doux">{a === 'subscribers' ? 'Newsletter → Abonnés' : 'Invitation → Non-abonnés'}</div>
          </button>
        ))}
      </div>

      {/* Ajout manuel */}
      <div className="px-4 pt-3">
        <div className="flex gap-2">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addEmail() }} type="email" placeholder="Ajouter un email aux abonnés (test)…" className="min-w-0 flex-1 rounded-xl border bg-white px-3.5 py-2.5 text-[13px] outline-none" style={{ borderColor: '#EDE6DA' }} />
          <button onClick={addEmail} className="shrink-0 rounded-xl bg-primary px-4 text-[13px] font-bold text-white">Ajouter</button>
        </div>
        {extra.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{extra.map(x => <span key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-bord bg-white px-2.5 py-1 text-[11px] text-texte">{x.email}<button onClick={() => removeEmail(x.email)} className="font-bold text-texte-doux">✕</button></span>)}</div>}
      </div>

      {/* Objet */}
      <div className="px-4 pt-4">
        <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Objet de l’email</label>
        {audience === 'subscribers'
          ? <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Cette semaine au village 🌿" className={fieldCls} />
          : <input value={inviteSubject} onChange={e => setInviteSubject(e.target.value)} className={fieldCls} />}
      </div>

      {/* Composition */}
      {audience === 'non_subscribers' ? (
        <div className="px-4 pt-4">
          <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Mail d’invitation (simple)</label>
          <div className="flex flex-col gap-2 rounded-2xl border bg-white p-3" style={{ borderColor: '#EDE6DA' }}>
            <ImageField label="Image d’en-tête (optionnelle)" url={invite.imageUrl} onChange={url => setInvite(v => ({ ...v, imageUrl: url }))} />
            <input value={invite.titre} onChange={e => setInvite(v => ({ ...v, titre: e.target.value }))} placeholder="Titre" className={fieldCls} />
            <textarea value={invite.message} onChange={e => setInvite(v => ({ ...v, message: e.target.value }))} rows={5} placeholder="Le mot d’invitation…" className={fieldCls + ' resize-none'} />
            <p className="text-[11px] text-texte-doux">Le bouton « Je m’abonne » est ajouté automatiquement (lien personnalisé).</p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Sections (glisse ⠿ pour réordonner)</label>
          <div className="flex flex-col gap-2">
            {blocks.map((b, i) => (
              <div key={b.id} draggable onDragStart={() => { dragIdx.current = i }} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragIdx.current !== null && dragIdx.current !== i) setBlocks(bs => reorder(bs, dragIdx.current!, i)); dragIdx.current = null }} className="rounded-2xl border bg-white" style={{ borderColor: '#EDE6DA' }}>
                <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: '#F2ECE2' }}>
                  <span className="cursor-grab text-texte-doux">⠿</span>
                  <span className="flex-1 text-[12px] font-bold text-texte">{BLOCK_LABELS[b.type]}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-texte-doux disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="px-1 text-texte-doux disabled:opacity-30">↓</button>
                  <button onClick={() => removeBlock(b.id)} className="px-1 font-bold text-[#C0392B]">✕</button>
                </div>
                <div className="p-3"><BlockEditor block={b} patch={p => patchBlock(b.id, p)} /></div>
              </div>
            ))}
          </div>
          <div className="relative mt-2">
            <button onClick={() => setAddOpen(o => !o)} className="w-full rounded-2xl border-2 border-dashed py-3 text-[13px] font-bold text-texte-doux" style={{ borderColor: '#D8CFC2' }}>+ Ajouter une section</button>
            {addOpen && <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-lg" style={{ borderColor: '#EDE6DA' }}>{ADD_TYPES.map(t => <button key={t} onClick={() => addBlock(t)} className="block w-full border-b px-4 py-2.5 text-left text-[13px] text-texte" style={{ borderColor: '#F2ECE2' }}>{BLOCK_LABELS[t]}</button>)}</div>}
          </div>
        </div>
      )}

      {/* Aperçu email live */}
      <div className="px-4 pt-5">
        <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">Aperçu (rendu réel de l’email)</label>
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: '#EDE6DA' }}>
          <iframe title="Aperçu" srcDoc={previewHtml} className="block w-full" style={{ height: 520, border: 'none', background: '#FBF7F0' }} />
        </div>
      </div>

      {/* Envoi */}
      <div className="px-4 pt-5">
        <button onClick={send} disabled={sending} className="flex w-full items-center justify-center rounded-2xl border-none bg-primary py-3.5 text-[14px] font-extrabold text-white disabled:opacity-60">{sending ? 'Envoi…' : `Envoyer à ${recipientCount} destinataire${recipientCount > 1 ? 's' : ''}`}</button>
        <p className="mt-2 text-center text-[11px] text-texte-doux">Depuis lettre@laplaceduvillage.app · brouillon sauvegardé</p>
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
  if (b.type === 'text') return <textarea value={b.texte} onChange={e => patch({ texte: e.target.value } as Partial<NewsletterBlock>)} rows={4} placeholder="Ton texte…" className={fieldCls + ' resize-none'} />
  if (b.type === 'button') return (
    <div className="flex flex-col gap-2">
      <input value={b.label} onChange={e => patch({ label: e.target.value } as Partial<NewsletterBlock>)} placeholder="Texte du bouton" className={fieldCls} />
      <input value={b.href} onChange={e => patch({ href: e.target.value } as Partial<NewsletterBlock>)} placeholder="Lien (https://…)" className={fieldCls} />
    </div>
  )
  if (b.type === 'image') return <ImageField label="Image" url={b.url} onChange={url => patch({ url } as Partial<NewsletterBlock>)} />
  if (b.type === 'separator') return <p className="text-center text-[12px] text-texte-doux">— ligne de séparation —</p>
  if (b.type === 'journal') return <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
  if (b.type === 'partenaires') return (
    <div className="flex flex-col gap-2">
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
      <ItemPicker kind="partenaires" ids={b.ids} onChange={ids => patch({ ids } as Partial<NewsletterBlock>)} />
    </div>
  )
  // events / promos / annonces
  return (
    <div className="flex flex-col gap-2">
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
      <div className="flex gap-1.5">
        <button onClick={() => patch({ mode: 'auto' } as Partial<NewsletterBlock>)} className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: b.mode === 'auto' ? 'var(--primary)' : '#F0EAE0', color: b.mode === 'auto' ? '#fff' : '#7A6A5A' }}>Auto (récents)</button>
        <button onClick={() => patch({ mode: 'manual' } as Partial<NewsletterBlock>)} className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: b.mode === 'manual' ? 'var(--primary)' : '#F0EAE0', color: b.mode === 'manual' ? '#fff' : '#7A6A5A' }}>Choisir</button>
      </div>
      {b.mode === 'auto'
        ? <label className="flex items-center gap-2 text-[12px] text-texte-doux">Nombre : <input type="number" min={1} max={12} value={b.count} onChange={e => patch({ count: Math.max(1, Math.min(12, parseInt(e.target.value) || 1)) } as Partial<NewsletterBlock>)} className="w-16 rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: '#EDE6DA' }} /></label>
        : <ItemPicker kind={b.type} ids={b.ids} onChange={ids => patch({ ids } as Partial<NewsletterBlock>)} />}
    </div>
  )
}

// ── Picker générique (recherche + sélection) ────────────────────────────────
function ItemPicker({ kind, ids, onChange }: { kind: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ value: string; label: string; sub: string | null }[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => { authedFetch(`/api/admin/newsletter/content?search=${kind}&q=${encodeURIComponent(q.trim())}`).then(async r => { if (r.ok) setResults((await r.json()).results ?? []) }).catch(() => {}) }, 250)
    return () => clearTimeout(t)
  }, [q, kind])

  const add = (v: string, label: string) => { if (!ids.includes(v)) onChange([...ids, v]); setLabels(l => ({ ...l, [v]: label })); setQ(''); setResults([]) }
  return (
    <div className="flex flex-col gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher et ajouter…" className={fieldCls} />
      {results.length > 0 && <div className="overflow-hidden rounded-lg border" style={{ borderColor: '#EDE6DA' }}>{results.map(r => <button key={r.value} onClick={() => add(r.value, r.label)} className="block w-full border-b px-3 py-2 text-left text-[12.5px] text-texte" style={{ borderColor: '#F2ECE2' }}>{r.label}{r.sub ? ` · ${r.sub}` : ''}</button>)}</div>}
      {ids.length > 0 && <div className="flex flex-wrap gap-1.5">{ids.map(v => <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-bord bg-white px-2.5 py-1 text-[11px] text-texte">{labels[v] ?? v}<button onClick={() => onChange(ids.filter(x => x !== v))} className="font-bold text-texte-doux">✕</button></span>)}</div>}
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
    try { const blob = await compressImage(file, { maxDim: 1280, quality: 0.85 }); const up = await uploadViaSignedUrl({ file: blob, kind: 'admin-edit' }); onChange(up.publicUrl) } catch { toast.error('Upload échoué') } finally { setBusy(false) }
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
