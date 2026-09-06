'use client'
import { useRef, useState } from 'react'
import ChampTexteRiche from '@/components/ChampTexteRiche'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import { compressAndUpload } from '@/lib/clientUpload'
import { type MediaItem, MAX_PHOTOS } from '@/lib/postMedia'
import { MAX_POLL_OPTIONS, type ForumPoll } from '@/lib/forum'
import IdentitePicker from '@/components/IdentitePicker'

export interface EditTopicInit {
  id: string
  titre: string
  corps: string | null
  media: MediaItem[] | null
  poll: ForumPoll | null
}

export default function NewTopicModal({ onClose, onCreated, editTopic, onUpdated, pollLocked = false }: {
  onClose: () => void
  onCreated?: (id: string) => void
  editTopic?: EditTopicInit
  onUpdated?: (patch: { titre: string; corps: string | null; media: MediaItem[]; poll: ForumPoll | null }) => void
  /** Édition : sondage déjà voté → choix figés (question seule modifiable). */
  pollLocked?: boolean
}) {
  const isEdit = !!editTopic
  const [titre, setTitre]       = useState(editTopic?.titre ?? '')
  const [corps, setCorps]       = useState(editTopic?.corps ?? '')
  const [media, setMedia]       = useState<MediaItem[]>(editTopic?.media ?? [])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]   = useState(false)
  const [pollOpen, setPollOpen] = useState(!!editTopic?.poll)
  /** Saisie d'un lien à joindre — cf. le bloc « Lien » plus bas. */
  const [lienOuvert, setLienOuvert] = useState(false)
  const [lienUrl, setLienUrl]       = useState('')
  const [lienTitre, setLienTitre]   = useState('')
  const [lienEnCours, setLienEnCours] = useState(false)
  // Blase : identité d'ouverture du sujet. En édition, elle est figée.
  const [blase, setBlase]       = useState<string | null>(null)
  const [question, setQuestion] = useState(editTopic?.poll?.question ?? '')
  const [options, setOptions]   = useState<string[]>(editTopic?.poll?.options?.length ? editTopic.poll.options : ['', ''])
  const fileRef = useRef<HTMLInputElement>(null)
  const photoCount = media.filter(m => m.t === 'photo').length

  async function pickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const slots = MAX_PHOTOS - photoCount
    if (slots <= 0) { toast.error(`Maximum ${MAX_PHOTOS} photos`); return }
    setUploading(true)
    try {
      for (const file of files.slice(0, slots)) {
        const { publicUrl } = await compressAndUpload(file, { kind: 'post-media' })
        setMedia(prev => [...prev, { t: 'photo', url: publicUrl }])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec upload')
    } finally { setUploading(false) }
  }

  const validOptions = options.map(o => o.trim()).filter(Boolean)
  const pollValid = pollOpen && question.trim().length > 0 && validOptions.length >= 2
  const canPost = titre.trim().length > 0 && !posting && !uploading

  async function publish() {
    if (!canPost) return
    setPosting(true)
    const poll: ForumPoll | null = pollValid ? { question: question.trim(), options: validOptions } : null
    const payload = { titre: titre.trim(), corps: corps.trim() || null, media, poll }
    const payloadCreation = { ...payload, etablissement_id: blase }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
      if (isEdit && editTopic) {
        const res = await fetch(`/api/forum/topics/${editTopic.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Erreur')
        onUpdated?.(payload)
        onClose()
      } else {
        const res = await fetch('/api/forum/topics', { method: 'POST', headers, body: JSON.stringify(payloadCreation) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Erreur')
        onCreated?.(d.id as string)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setPosting(false)
    }
  }

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[3500] flex flex-col bg-creme font-inter text-texte" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-2.5" style={{ borderBottom: '1px solid #F0EAE0', paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
          <button type="button" onClick={onClose} disabled={posting} className="-ml-2 flex h-10 w-10 items-center justify-center bg-transparent text-texte disabled:opacity-60" aria-label="Fermer">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="flex-1 truncate text-center font-serif text-[17px]" style={{ letterSpacing: '-0.005em' }}>{isEdit ? 'Modifier le sujet' : 'Nouveau sujet'}</div>
          <button type="button" onClick={publish} disabled={!canPost} className="rounded-full bg-primary px-3.5 py-[7px] text-[12px] font-extrabold text-white disabled:opacity-50">
            {posting ? '…' : isEdit ? 'Enregistrer' : 'Publier'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pt-4">
          {!isEdit && <IdentitePicker value={blase} onChange={setBlase} />}
          <input
            value={titre}
            onChange={e => setTitre(e.target.value.slice(0, 200))}
            placeholder="Titre du sujet"
            className="block w-full bg-transparent font-serif text-[20px] text-texte outline-none placeholder:text-texte-tres-doux"
            style={{ letterSpacing: '-0.01em' }}
          />
          {/* Le corps du sujet passe par le champ de rédaction commun : mêmes
              boutons de mise en forme que les fiches, même aperçu, et le même
              format stocké — que `TexteRiche` sait déjà afficher. */}
          <div className="mt-3">
            <ChampTexteRiche
              valeur={corps}
              onChange={v => setCorps(v.slice(0, 5000))}
              placeholder="Développe ton sujet… (optionnel)"
              rows={6}
              labelApercu="Aperçu"
            />
          </div>

          {/* Photos */}
          {media.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {media.map((m, i) => m.t === 'photo' ? (
                <div key={i} className="relative">
                  <button type="button" onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#DC2626] text-white" style={{ fontSize: 12, lineHeight: 1 }}>×</button>
                  <img src={m.url} alt="" className="h-[72px] w-[72px] rounded-[10px] object-cover" />
                </div>
              ) : null)}
            </div>
          )}

          {/* Lien joint — rendu ensuite en carte cliquable par PostMedia, comme
              dans les publications. On tente l'aperçu automatique, mais on
              laisse toujours écrire le titre : beaucoup de sites (les cagnottes
              en particulier) refusent les robots et ne rendront jamais rien. */}
          {lienOuvert && (
            <div className="mt-3 rounded-[14px] border bg-cremeDeep p-3" style={{ borderColor: '#E8E0D4' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-primary">Lien</span>
                <button type="button" onClick={() => setLienOuvert(false)} className="text-[11px] font-bold text-texte-doux underline">Annuler</button>
              </div>
              <input
                value={lienUrl}
                onChange={e => setLienUrl(e.target.value)}
                placeholder="https://…"
                className="mb-2 block w-full rounded-[10px] border bg-white px-3 py-2 text-[13px] text-texte outline-none"
                style={{ borderColor: '#E8E0D4', colorScheme: 'light' }}
              />
              <input
                value={lienTitre}
                onChange={e => setLienTitre(e.target.value.slice(0, 200))}
                placeholder="Titre affiché (facultatif)"
                className="mb-2 block w-full rounded-[10px] border bg-white px-3 py-2 text-[13px] text-texte outline-none"
                style={{ borderColor: '#E8E0D4', colorScheme: 'light' }}
              />
              <button
                type="button"
                disabled={lienEnCours || !/^https?:\/\//i.test(lienUrl.trim())}
                onClick={async () => {
                  const url = lienUrl.trim()
                  if (!/^https?:\/\//i.test(url)) return
                  setLienEnCours(true)
                  let titre = lienTitre.trim() || null
                  let description: string | null = null
                  let image: string | null = null
                  try {
                    const { data: { session } } = await supabase.auth.getSession()
                    const r = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
                      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
                    })
                    const j = await r.json().catch(() => null)
                    if (j && !j.error) {
                      titre = titre ?? (j.title ?? null)
                      description = j.description ?? null
                      image = j.image ?? null
                    }
                  } catch { /* l'aperçu est un bonus, pas une condition */ }
                  setMedia(prev => [...prev, { t: 'link', url, title: titre, description, image }])
                  setLienUrl(''); setLienTitre(''); setLienOuvert(false); setLienEnCours(false)
                }}
                className="rounded-[10px] bg-primary px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {lienEnCours ? 'Ajout…' : 'Joindre le lien'}
              </button>
            </div>
          )}

          {/* Liens déjà joints */}
          {media.some(m => m.t === 'link') && (
            <div className="mt-2 flex flex-col gap-1.5">
              {media.map((m, i) => m.t === 'link' ? (
                <div key={i} className="flex items-center gap-2 rounded-[10px] border bg-white px-2.5 py-1.5" style={{ borderColor: '#E8E0D4' }}>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-texte">{m.title || m.url}</span>
                  <button type="button" onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))} className="shrink-0 text-[11px] font-bold text-accent">Retirer</button>
                </div>
              ) : null)}
            </div>
          )}

          {/* Sondage */}
          {pollOpen && (
            <div className="mt-4 rounded-[14px] border bg-cremeDeep p-3" style={{ borderColor: '#E8E0D4' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-primary">Sondage</span>
                {!pollLocked && (
                  <button type="button" onClick={() => setPollOpen(false)} className="text-[11px] font-bold text-texte-doux underline">Retirer</button>
                )}
              </div>
              <input value={question} onChange={e => setQuestion(e.target.value.slice(0, 200))} placeholder="Ta question…" className="mb-2 block w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none" style={{ borderColor: '#E8E0D4', background: '#fff', colorScheme: 'light' }} />
              <div className="flex flex-col gap-1.5">
                {options.map((o, i) => (
                  <input key={i} value={o} disabled={pollLocked} readOnly={pollLocked} onChange={e => setOptions(prev => prev.map((x, j) => j === i ? e.target.value.slice(0, 100) : x))} placeholder={`Choix ${i + 1}`} className="block w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none disabled:opacity-60" style={{ borderColor: '#E8E0D4', background: pollLocked ? '#F0EAE0' : '#fff', colorScheme: 'light' }} />
                ))}
              </div>
              {pollLocked ? (
                <p className="mt-2 text-[11px] italic text-texte-doux">Des votes ont été enregistrés : les choix sont verrouillés (seule la question reste modifiable).</p>
              ) : options.length < MAX_POLL_OPTIONS && (
                <button type="button" onClick={() => setOptions(prev => [...prev, ''])} className="mt-2 text-[12px] font-bold text-primary">+ Ajouter un choix</button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-1.5 pb-8">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || photoCount >= MAX_PHOTOS} className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary disabled:opacity-50">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {uploading ? '…' : 'Photo'}
            </button>
            {!lienOuvert && (
              <button type="button" onClick={() => setLienOuvert(true)} className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Lien
              </button>
            )}
            {!pollOpen && (
              <button type="button" onClick={() => setPollOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                Sondage
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={pickPhotos} style={{ display: 'none' }} />
        </div>
      </div>
    </ClientPortal>
  )
}
