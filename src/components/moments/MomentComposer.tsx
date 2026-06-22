'use client'
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import { MOMENT_VIDEO_MAX_SEC } from '@/lib/moments'

interface Props {
  onClose: () => void
  onPublished: () => void
}

type Step = 'source' | 'preview'
interface Picked { file: File; kind: 'photo' | 'video'; url: string; duree: number | null }
interface EtabLite { id: string; nom: string }
interface EvtLite { id: string; titre: string }

// Lecture robuste de la durée : certaines vidéos capturées renvoient
// duration=Infinity tant qu'on n'a pas "seeké" → on force le calcul.
// Renvoie 0 si vraiment illisible (la publication n'est alors pas bloquée).
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    let settled = false
    const done = (d: number) => { if (settled) return; settled = true; try { URL.revokeObjectURL(v.src) } catch { /* noop */ } resolve(Number.isFinite(d) ? d : 0) }
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        v.currentTime = 1e101   // force le navigateur à parcourir → durée réelle
        v.ontimeupdate = () => { v.ontimeupdate = null; done(v.duration) }
      } else done(v.duration)
    }
    v.onerror = () => done(0)
    v.src = URL.createObjectURL(file)
  })
}

export default function MomentComposer({ onClose, onPublished }: Props) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('source')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [legende, setLegende] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)  // 0→100 upload, null = idle
  const [error, setError] = useState<string | null>(null)

  // Liens optionnels
  const [ownedEtab, setOwnedEtab] = useState<EtabLite | null>(null)
  const [linkEtab, setLinkEtab] = useState(false)
  const [evtPickerOpen, setEvtPickerOpen] = useState(false)
  const [linkedEvt, setLinkedEvt] = useState<EvtLite | null>(null)

  const camVideoRef = useRef<HTMLInputElement>(null)
  const camPhotoRef = useRef<HTMLInputElement>(null)
  const galleryRef  = useRef<HTMLInputElement>(null)

  // Établissement possédé par l'user → chip "Lier mon lieu"
  useEffect(() => {
    if (!user) return
    supabase.from('etablissements').select('id, nom').eq('user_id', user.id).limit(1)
      .then(({ data }) => { if (data && data[0]) setOwnedEtab(data[0] as EtabLite) })
  }, [user])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const isVideo = file.type.startsWith('video/')
    if (isVideo) {
      const duree = await getVideoDuration(file)
      if (duree > MOMENT_VIDEO_MAX_SEC + 0.5) {
        setError(`Vidéo trop longue (${Math.round(duree)}s) — 60s maximum.`)
        return
      }
      // Durée illisible (0) → fallback 60 : la fiche passe la validation serveur,
      // et le viewer avance de toute façon à la fin réelle de la vidéo (onEnded).
      const finalDuree = duree > 0 ? Math.max(1, Math.round(duree)) : 60
      setPicked({ file, kind: 'video', url: URL.createObjectURL(file), duree: finalDuree })
    } else if (file.type.startsWith('image/')) {
      setPicked({ file, kind: 'photo', url: URL.createObjectURL(file), duree: null })
    } else {
      setError('Format non supporté (photo ou vidéo)')
      return
    }
    setStep('preview')
  }

  const publish = async () => {
    if (!picked) return
    setBusy(true); setError(null); setProgress(0)
    try {
      let mediaUrl: string
      if (picked.kind === 'photo') {
        const compressed = await compressImage(picked.file, { maxDim: 1280, quality: 0.85 })
        const up = await uploadViaSignedUrl({ file: compressed, kind: 'moment-image', onProgress: setProgress })
        mediaUrl = up.publicUrl
      } else {
        const up = await uploadViaSignedUrl({ file: picked.file, kind: 'moment-video', onProgress: setProgress })
        mediaUrl = up.publicUrl
      }
      setProgress(100)   // upload fini → finalisation côté serveur

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          media_kind: picked.kind,
          media_url: mediaUrl,
          duree_sec: picked.duree,
          legende: legende.trim() || null,
          etablissement_id: linkEtab && ownedEtab ? ownedEtab.id : null,
          evenement_id: linkedEvt?.id ?? null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Échec de la publication')
      toast.success('Ton moment est en ligne !')
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally { setBusy(false); setProgress(null) }
  }

  if (typeof document === 'undefined') return null

  // ── Aperçu + légende + publier ──────────────────────────────────────────
  if (step === 'preview' && picked) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: '#0D0906', fontFamily: 'Inter, sans-serif' }}>
        {picked.kind === 'video'
          ? <video src={picked.url} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={picked.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 48%, rgba(0,0,0,0.9) 100%)' }} />

        {/* top */}
        <div style={{ position: 'absolute', top: 'max(16px,env(safe-area-inset-top,16px))', left: 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 }}>
          <button onClick={() => { setStep('source'); setPicked(null) }} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            visible 24h{picked.duree ? ` · ${picked.duree}s` : ''}
          </span>
        </div>

        {/* bas */}
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'max(20px,env(safe-area-inset-bottom,20px))', zIndex: 5 }}>
          <textarea
            value={legende} onChange={e => setLegende(e.target.value)} rows={2} maxLength={500}
            placeholder="Ajoute une légende…"
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '12px 14px', color: '#fff', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {ownedEtab && (
              <button onClick={() => setLinkEtab(v => !v)} style={chipStyle(linkEtab)}>📍 {linkEtab ? ownedEtab.nom : 'Lier mon lieu'}</button>
            )}
            <button onClick={() => setEvtPickerOpen(true)} style={chipStyle(!!linkedEvt)}>🎟️ {linkedEvt ? linkedEvt.titre.slice(0, 22) : 'Un événement'}</button>
            {linkedEvt && <button onClick={() => setLinkedEvt(null)} style={chipStyle(false)}>✕</button>}
          </div>
          {error && <p style={{ margin: '10px 0 0', padding: '8px 12px', borderRadius: 10, background: 'rgba(192,57,43,0.92)', color: '#fff', fontSize: 12 }}>{error}</p>}
          {busy && progress !== null && (
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: '#E8622A', borderRadius: 999, transition: 'width 0.2s ease' }} />
              </div>
              <p style={{ margin: '7px 0 0', fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
                {progress < 100 ? `Envoi… ${progress}%` : 'Finalisation…'}
              </p>
            </div>
          )}
          {!(busy && progress !== null) && (
            <button onClick={publish} disabled={busy} style={{ width: '100%', marginTop: 14, padding: 15, borderRadius: 15, border: 'none', background: '#E8622A', color: '#fff', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {busy ? 'Préparation…' : <>Publier mon moment →</>}
            </button>
          )}
        </div>

        {evtPickerOpen && <EventPicker onPick={e => { setLinkedEvt(e); setEvtPickerOpen(false) }} onClose={() => setEvtPickerOpen(false)} />}
      </div>,
      document.body,
    )
  }

  // ── Source (bottom sheet) ─────────────────────────────────────────────────
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,10,5,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#FBFAF7', borderRadius: '24px 24px 0 0', paddingBottom: 'max(20px,env(safe-area-inset-bottom,20px))', boxShadow: '0 -8px 40px rgba(0,0,0,0.22)' }}>
        <div style={{ width: 44, height: 4, borderRadius: 2, background: '#D1CCC4', margin: '12px auto 0' }} />
        <div style={{ padding: '16px 24px 0', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 23, color: '#1A1209', letterSpacing: '-0.02em' }}>Partage ton moment</h2>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: '#7A6A5A', maxWidth: 280, lineHeight: 1.5 }}>Une vidéo ou une photo de ce qui se passe, là, maintenant.</p>
        </div>
        <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SourceRow onClick={() => camVideoRef.current?.click()} tint="#FFF0E5" c="#C84B2F" label="Filmer une vidéo" sub="jusqu'à 60 secondes"
            icon={<><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>} />
          <SourceRow onClick={() => camPhotoRef.current?.click()} tint="#FFF0E5" c="#E8622A" label="Prendre une photo" sub="capture instantanée"
            icon={<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>} />
          <SourceRow onClick={() => galleryRef.current?.click()} tint="#E8F2EB" c="#2D5A3D" label="Choisir dans la galerie" sub="photo ou vidéo existante"
            icon={<><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>} />
        </div>
        <div style={{ margin: '18px 16px 0', padding: '11px 14px', background: '#F4EEE3', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A4A3A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div style={{ fontSize: 11.5, color: '#5A4A3A', lineHeight: 1.4 }}>Ton moment reste visible <b style={{ color: '#1A1209' }}>24h</b>, puis disparaît automatiquement.</div>
        </div>
        {error && <p style={{ margin: '12px 16px 0', padding: '8px 12px', borderRadius: 10, background: '#FDECEA', color: '#C0392B', fontSize: 12 }}>{error}</p>}
        <button onClick={onClose} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#9A8A7A' }}>Annuler</button>
      </div>

      <input ref={camVideoRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      <input ref={camPhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
    </div>,
    document.body,
  )
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: active ? '#E8622A' : 'rgba(255,255,255,0.16)',
    color: '#fff', padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
    border: active ? '1px solid #E8622A' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
  }
}

function SourceRow({ onClick, icon, c, tint, label, sub }: { onClick: () => void; icon: React.ReactNode; c: string; tint: string; label: string; sub: string }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', background: '#fff', border: '1px solid #F0EAE0', borderRadius: 14, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: tint, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#1A1209', letterSpacing: '-0.01em' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: '#7A6A5A', marginTop: 1 }}>{sub}</span>
      </span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C4B9A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
    </button>
  )
}

// Mini-picker d'événement à venir (recherche simple).
function EventPicker({ onPick, onClose }: { onPick: (e: EvtLite) => void; onClose: () => void }) {
  const [items, setItems] = useState<EvtLite[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    supabase.from('evenements').select('id, titre, date_debut').eq('statut', 'publie').gte('date_debut', iso).order('date_debut', { ascending: true }).limit(60)
      .then(({ data }) => setItems(((data ?? []) as { id: string; titre: string }[]).map(e => ({ id: e.id, titre: e.titre }))))
  }, [])
  const filtered = q.trim() ? items.filter(e => e.titre.toLowerCase().includes(q.toLowerCase())) : items
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '70vh', background: '#FBFAF7', borderRadius: '20px 20px 0 0', padding: '14px 16px max(20px,env(safe-area-inset-bottom,20px))', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D1CCC4', margin: '0 auto 12px' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un événement…" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: '1px solid #E5DDD2', fontSize: 14, outline: 'none', marginBottom: 10 }} />
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#9A8A7A', fontSize: 13, padding: '16px 0' }}>Aucun événement</p>}
          {filtered.map(e => (
            <button key={e.id} onClick={() => onPick(e)} style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: '1px solid #F0EAE0', background: '#fff', fontSize: 13.5, fontWeight: 600, color: '#1A1209', cursor: 'pointer' }}>{e.titre}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
