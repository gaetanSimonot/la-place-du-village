'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { compressImage, uploadViaSignedUrl } from '@/lib/clientUpload'

/**
 * Modale « Ma bibliothèque d'images » : grille des images de l'admin,
 * import d'une nouvelle (compress + upload), sélection, suppression.
 */
export default function ImageLibraryPicker({ onSelect, onClose, currentUrl }: {
  onSelect: (url: string) => void
  onClose: () => void
  currentUrl?: string | null
}) {
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => fetch('/api/image-library').then(r => (r.ok ? r.json() : { images: [] })).then(d => setImages(d.images ?? [])).catch(() => {})
  useEffect(() => { load() }, [])

  const token = async () => {
    await supabase.auth.refreshSession().catch(() => {})   // token frais (sinon POST admin échoue en silence)
    return (await supabase.auth.getSession()).data.session?.access_token
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      await supabase.auth.refreshSession().catch(() => {})   // token frais AVANT l'upload (sinon « Non authentifié »)
      const compressed = await compressImage(file)
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'hub-hero-intro' })
      const tk = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('/api/image-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
        body: JSON.stringify({ url: publicUrl }),
      })
      if (r.ok) { const d = await r.json(); setImages(d.images ?? []) }
      onSelect(publicUrl)   // sélectionne directement la nouvelle image
      onClose()
    } catch (err) {
      toast.error('Import échoué : ' + (err instanceof Error ? err.message : 'erreur'))
    }
    setBusy(false)
  }

  const remove = async (url: string) => {
    const tk = await token()
    const r = await fetch('/api/image-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
      body: JSON.stringify({ url, remove: true }),
    }).catch(() => null)
    if (r && r.ok) { const d = await r.json(); setImages(d.images ?? []) }
    else toast.error('Suppression non enregistrée — réessaie')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(26,18,9,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: 'var(--font-body), sans-serif' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '85dvh', background: '#FDFAF5', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <div style={{ margin: '8px auto 0', width: 44, height: 5, borderRadius: 3, background: '#E4DED2' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px 8px' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display), serif', fontSize: 18, color: '#1A1209' }}>Ma bibliothèque</h2>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ background: '#234A30', color: '#fff', border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {busy ? 'Envoi…' : '+ Importer'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
        </div>
        <div className="pdv-hscroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {images.length === 0 && <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#9A8A78', fontSize: 13, padding: '28px 0' }}>Aucune image. Importes-en une avec « + Importer ».</p>}
          {images.map(url => (
            <div key={url} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: url === currentUrl ? '2.5px solid #234A30' : '2.5px solid transparent', aspectRatio: '2 / 1', background: '#EAE4D8' }}>
              <button onClick={() => { onSelect(url); onClose() }} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', height: '100%' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
              <button onClick={() => remove(url)} aria-label="Supprimer" style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
