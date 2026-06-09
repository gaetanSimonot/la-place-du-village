'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { authedFetch } from '@/lib/swr-fetchers'
import type { PosterEvent, PosterParams } from '@/components/PosterGeneratorModal'

const SOC = [
  { key: 'square',         label: 'Carré',    slug: 'carre' },
  { key: 'facebook-cover', label: 'Bannière', slug: 'banniere' },
  { key: 'a4-print',       label: 'Affiche',  slug: 'affiche' },
]

export default function SocialsModal({ event, params, onClose }: {
  event: PosterEvent
  params: PosterParams
  onClose: () => void
}) {
  const [imgs, setImgs] = useState<Record<string, { url: string; blob: Blob }>>({})
  const [imgLoading, setImgLoading] = useState(true)
  const [text, setText] = useState('')
  const [textLoading, setTextLoading] = useState(true)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    let alive = true
    // 1) Les 3 formats, à partir des MÊMES paramètres que l'affiche validée.
    ;(async () => {
      const out: Record<string, { url: string; blob: Blob }> = {}
      for (const f of SOC) {
        try {
          const res = await authedFetch('/api/poster/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event,
              opts: {
                template: params.template, format: f.key,
                image: params.photo, logo: params.logo,
                bgIndex: params.bgIndex, accent: params.accent,
                solidBg: params.solidBg, solidColor: params.solidColor,
              },
            }),
          })
          if (!res.ok) continue
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          urlsRef.current.push(url)
          out[f.key] = { url, blob }
        } catch { /* ignore ce format */ }
      }
      if (alive) { setImgs(out); setImgLoading(false) }
    })()

    // 2) Le texte réseaux (IA).
    ;(async () => {
      try {
        const res = await authedFetch('/api/poster/social-text', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event }),
        })
        const d = await res.json().catch(() => ({}))
        if (alive) setText(d.text ?? '')
      } catch { /* ignore */ }
      finally { if (alive) setTextLoading(false) }
    })()

    return () => { alive = false; urlsRef.current.forEach(u => URL.revokeObjectURL(u)) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const download = (key: string, slug: string) => {
    const it = imgs[key]; if (!it) return
    const a = document.createElement('a')
    a.href = it.url
    a.download = `${(event.titre || 'affiche').slice(0, 40).replace(/[^\w\-]+/g, '_')}-${slug}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  const copyImage = async (key: string) => {
    const it = imgs[key]; if (!it) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': it.blob })])
      toast.success('Image copiée')
    } catch {
      toast.error('Copie image non supportée ici — utilise Télécharger')
    }
  }

  const copyText = async () => {
    try { await navigator.clipboard.writeText(text); toast.success('Texte copié') }
    catch { toast.error('Copie impossible') }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4100, background: '#FDFAF5', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #EDE8E0', background: '#fff' }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A1209' }}>Partager sur les réseaux</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8A7A6A', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SOC.map(f => {
          const it = imgs[f.key]
          return (
            <div key={f.key} style={{ background: '#fff', borderRadius: 16, border: '1px solid #F0EAE0', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>{f.label}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 110, background: '#F4EEE4', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                {it ? (
                  <img src={it.url} alt={f.label} style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }} />
                ) : imgLoading ? (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                  <p style={{ fontSize: 12, color: '#9A8A7A' }}>Indisponible</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => download(f.key, f.slug)} disabled={!it}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, border: 'none', background: '#2D5A3D', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: it ? 'pointer' : 'default', opacity: it ? 1 : 0.5, fontFamily: 'Inter, sans-serif' }}>
                  ⬇ Télécharger
                </button>
                <button onClick={() => copyImage(f.key)} disabled={!it}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, border: '1.5px solid #2D5A3D', background: '#fff', color: '#2D5A3D', fontSize: 12.5, fontWeight: 700, cursor: it ? 'pointer' : 'default', opacity: it ? 1 : 0.5, fontFamily: 'Inter, sans-serif' }}>
                  ⧉ Copier
                </button>
              </div>
            </div>
          )
        })}

        {/* Texte réseaux */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #F0EAE0', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>Texte pour la publication</p>
            <button onClick={copyText} disabled={!text}
              style={{ padding: '6px 12px', borderRadius: 9, border: '1.5px solid #2D5A3D', background: '#fff', color: '#2D5A3D', fontSize: 12, fontWeight: 700, cursor: text ? 'pointer' : 'default', opacity: text ? 1 : 0.5, fontFamily: 'Inter, sans-serif' }}>
              ⧉ Copier
            </button>
          </div>
          {textLoading ? (
            <p style={{ fontSize: 12.5, color: '#9A8A7A', margin: '6px 0' }}>Rédaction en cours…</p>
          ) : (
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
              placeholder="Texte de la publication…"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 10, border: '1.5px solid #E0D8CE', background: '#FBF7F0', padding: '10px 12px', fontSize: 13, lineHeight: 1.5, color: '#2C1810', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))', borderTop: '1px solid #EDE8E0', background: '#fff' }}>
        <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: '#2D5A3D', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Fermer
        </button>
      </div>
    </div>,
    document.body
  )
}
