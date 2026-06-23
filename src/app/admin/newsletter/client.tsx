'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/swr-fetchers'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import { makeBlock, starterBlocks, BLOCK_LABELS, type NewsletterBlock, type BlockType } from '@/lib/newsletterBlocks'

type Audience = 'subscribers' | 'non_subscribers'
const LS_KEY = 'newsletter_draft_v2'
const ADD_TYPES: BlockType[] = ['header', 'text', 'events', 'promos', 'annonces', 'partenaires', 'journal', 'article', 'button', 'image', 'separator']
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
  const [loaded, setLoaded] = useState(false)         // brouillon serveur chargé
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [listOpen, setListOpen] = useState<Audience | null>(null)
  const dragIdx = useRef<number | null>(null)

  useEffect(() => { if (!authLoading && (!user || !isAdmin)) router.replace('/') }, [authLoading, user, isAdmin, router])

  useEffect(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.blocks)) setBlocks(d.blocks); if (d.subject) setSubject(d.subject); if (d.invite) setInvite(d.invite); if (d.inviteSubject) setInviteSubject(d.inviteSubject) } } catch { /* noop */ }
  }, [])
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ blocks, subject, invite, inviteSubject })) } catch { /* noop */ } }, [blocks, subject, invite, inviteSubject])

  // Chargement du brouillon SERVEUR (prioritaire sur localStorage). Une fois
  // chargé, l'autosave serveur s'active.
  useEffect(() => {
    if (authLoading || !isAdmin) return
    authedFetch('/api/admin/newsletter/draft').then(async r => {
      if (r.ok) {
        const d = (await r.json()).draft
        if (d) {
          if (Array.isArray(d.blocks) && d.blocks.length) setBlocks(d.blocks)
          if (typeof d.subject === 'string') setSubject(d.subject)
          if (typeof d.inviteSubject === 'string' && d.inviteSubject) setInviteSubject(d.inviteSubject)
          if (d.invite) setInvite(d.invite)
        }
      }
    }).catch(() => {}).finally(() => setLoaded(true))
  }, [authLoading, isAdmin])

  // Autosave SERVEUR (continu, débounce) — actif après le 1er chargement.
  useEffect(() => {
    if (!loaded) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      const r = await authedFetch('/api/admin/newsletter/draft', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, inviteSubject, blocks, invite }) }).catch(() => null)
      setSaveState(r && r.ok ? 'saved' : 'idle')
    }, 800)
    return () => clearTimeout(t)
  }, [loaded, blocks, subject, invite, inviteSubject])

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
      <div className="flex justify-between px-4 pt-1.5">
        <button onClick={() => setListOpen('subscribers')} className="text-[11px] font-semibold text-primary underline">Voir les abonnés</button>
        <button onClick={() => setListOpen('non_subscribers')} className="text-[11px] font-semibold text-primary underline">Voir les non-abonnés</button>
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
        <p className="mt-2 text-center text-[11px] text-texte-doux">Depuis lettre@laplaceduvillage.app · {saveState === 'saving' ? 'enregistrement…' : 'enregistré sur le serveur ✓'}</p>
      </div>

      {listOpen && <ListModal audience={listOpen} onClose={() => setListOpen(null)} onChanged={load} />}
    </div>
  )
}

// ── Liste des abonnés / non-abonnés (consultation + abonner/désabonner) ─────
function ListModal({ audience, onClose, onChanged }: { audience: Audience; onClose: () => void; onChanged: () => void }) {
  const [people, setPeople] = useState<{ email: string; name: string | null; extra?: boolean }[] | null>(null)
  const [q, setQ] = useState('')
  const isSub = audience === 'subscribers'

  const load = useCallback(() => {
    authedFetch(`/api/admin/newsletter/list?audience=${audience}`).then(async r => setPeople(r.ok ? ((await r.json()).people ?? []) : [])).catch(() => setPeople([]))
  }, [audience])
  useEffect(() => { load() }, [load])

  const toggle = async (email: string) => {
    if (isSub) await authedFetch(`/api/admin/newsletter?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
    else await authedFetch('/api/admin/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    load(); onChanged()
  }

  const filtered = (people ?? []).filter(p => { const s = q.trim().toLowerCase(); return !s || (p.name ?? '').toLowerCase().includes(s) || p.email.toLowerCase().includes(s) })
  if (typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85vh', background: '#FBFAF7', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', paddingBottom: 'max(12px,env(safe-area-inset-bottom,12px))' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D1CCC4', margin: '12px auto 8px' }} />
        <p style={{ margin: '0 0 8px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#1A1209' }}>{isSub ? 'Abonnés' : 'Non-abonnés'} ({people?.length ?? '…'})</p>
        <div style={{ padding: '0 16px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un nom / email…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 12, border: '1px solid #E5DDD2', fontSize: 14, outline: 'none' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {people === null && <p style={{ textAlign: 'center', color: '#9A8A7A', fontSize: 13, padding: 16 }}>Chargement…</p>}
          {people !== null && filtered.length === 0 && <p style={{ textAlign: 'center', color: '#9A8A7A', fontSize: 13, padding: 16 }}>Personne dans cette liste.</p>}
          {filtered.map(p => (
            <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid #F2ECE2', background: '#fff' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name ?? p.email}{p.extra ? ' · ajouté' : ''}</span>
                {p.name && <span style={{ display: 'block', fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>}
              </span>
              <button onClick={() => toggle(p.email)} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: isSub ? '#F0EAE0' : 'var(--primary)', color: isSub ? '#B0483A' : '#fff' }}>{isSub ? 'Désabonner' : 'Abonner'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
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
  if (b.type === 'article') return (
    <div className="flex flex-col gap-2">
      <input value={b.titre} onChange={e => patch({ titre: e.target.value } as Partial<NewsletterBlock>)} placeholder="Titre de la section" className={fieldCls} />
      <ItemPicker kind="article" ids={b.ids} onChange={ids => patch({ ids } as Partial<NewsletterBlock>)} />
    </div>
  )
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
        ? <label className="flex items-center gap-2 text-[12px] text-texte-doux">Nombre : <CountInput value={b.count} onCommit={n => patch({ count: n } as Partial<NewsletterBlock>)} /></label>
        : <ItemPicker kind={b.type} ids={b.ids} onChange={ids => patch({ ids } as Partial<NewsletterBlock>)} />}
    </div>
  )
}

// ── Champ nombre robuste (autorise l'effacement avant de retaper) ───────────
function CountInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(value)) }, [value])
  const commit = () => { const n = Math.max(1, Math.min(12, parseInt(v, 10) || value)); onCommit(n); setV(String(n)) }
  return <input type="number" min={1} max={12} value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className="w-16 rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: '#EDE6DA' }} />
}

interface Pick { value: string; label: string; sub: string | null; image: string | null }

// ── Picker : bouton + modal (parcourir tout + rechercher + cocher) ──────────
function ItemPicker({ kind, ids, onChange }: { kind: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (ids.length === 0) return
    authedFetch(`/api/admin/newsletter/content?type=${kind}&ids=${ids.join(',')}`).then(async r => {
      if (!r.ok) return
      const items = (await r.json()).items ?? []
      setLabels(l => { const n = { ...l }; ids.forEach((id, i) => { if (items[i]?.title) n[id] = items[i].title }); return n })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => setOpen(true)} className="rounded-xl border-2 border-dashed py-2 text-[12.5px] font-bold text-texte-doux" style={{ borderColor: '#D8CFC2' }}>
        {ids.length ? `Modifier la sélection (${ids.length})` : 'Choisir les éléments…'}
      </button>
      {ids.length > 0 && <div className="flex flex-wrap gap-1.5">{ids.map(v => <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-bord bg-white px-2.5 py-1 text-[11px] text-texte">{labels[v] ?? '…'}<button onClick={() => onChange(ids.filter(x => x !== v))} className="font-bold text-texte-doux">✕</button></span>)}</div>}
      {open && <SectionPicker kind={kind} ids={ids} onSave={(newIds, newLabels) => { onChange(newIds); setLabels(l => ({ ...l, ...newLabels })); setOpen(false) }} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SectionPicker({ kind, ids, onSave, onClose }: { kind: string; ids: string[]; onSave: (ids: string[], labels: Record<string, string>) => void; onClose: () => void }) {
  const [candidates, setCandidates] = useState<Pick[] | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Pick[]>([])
  const [sel, setSel] = useState<string[]>(ids)
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => { authedFetch(`/api/admin/newsletter/content?browse=${kind}`).then(async r => setCandidates(r.ok ? ((await r.json()).results ?? []) : [])).catch(() => setCandidates([])) }, [kind])
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => { authedFetch(`/api/admin/newsletter/content?search=${kind}&q=${encodeURIComponent(q.trim())}`).then(async r => { if (r.ok) setResults((await r.json()).results ?? []) }).catch(() => {}) }, 250)
    return () => clearTimeout(t)
  }, [q, kind])

  const list = q.trim().length >= 2 ? results : (candidates ?? [])
  const toggle = (it: Pick) => { setSel(s => s.includes(it.value) ? s.filter(x => x !== it.value) : [...s, it.value]); setLabels(l => ({ ...l, [it.value]: it.label })) }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85vh', background: '#FBFAF7', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', paddingBottom: 'max(12px,env(safe-area-inset-bottom,12px))' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D1CCC4', margin: '12px auto 8px' }} />
        <div style={{ padding: '0 16px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher dans cette section…" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: '1px solid #E5DDD2', fontSize: 14, outline: 'none' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates === null && <p style={{ textAlign: 'center', color: '#9A8A7A', fontSize: 13, padding: 16 }}>Chargement…</p>}
          {candidates !== null && list.length === 0 && <p style={{ textAlign: 'center', color: '#9A8A7A', fontSize: 13, padding: 16 }}>Aucun élément.</p>}
          {list.map(it => {
            const on = sel.includes(it.value)
            return (
              <button key={it.value} onClick={() => toggle(it)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, border: `1.5px solid ${on ? 'var(--primary)' : '#EDE6DA'}`, background: on ? 'rgba(45,90,61,0.06)' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                {it.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={it.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 44, height: 44, borderRadius: 8, background: '#EDE6DA', flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  {it.sub && <span style={{ display: 'block', fontSize: 11, color: '#7A6A5A' }}>{it.sub}</span>}
                </span>
                <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary)' : '#fff', border: on ? 'none' : '1.5px solid #C4B9A8' }}>
                  {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px 0' }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #E5DDD2', background: '#fff', fontWeight: 700, fontSize: 13, color: '#7A6A5A', cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => onSave(sel, labels)} style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Valider ({sel.length})</button>
        </div>
      </div>
    </div>,
    document.body,
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
