'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ProductDraft {
  nom: string
  categorie: string
  prix_indicatif: string
  disponible: boolean
  periode_dispo: string
  selected: boolean
}

const CATEGORIES = [
  'Fruits & Légumes', 'Viandes & Charcuterie', 'Fromages & Laitages',
  'Miel & Confitures', 'Pains & Pâtisseries', 'Plantes & Fleurs',
  'Huiles & Condiments', 'Boissons', 'Artisanat', 'Autre',
]

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
  borderRadius: 10, border: '1px solid #DDD', fontFamily: 'Inter, sans-serif',
  fontSize: 13, color: '#2C1810', outline: 'none', backgroundColor: '#FAFAFA',
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export default function CaptureProducteur({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'mode' | 'capture' | 'review'>('mode')
  const [captureMode, setCaptureMode] = useState<'photos' | 'texte'>('photos')
  const [photos, setPhotos] = useState<{ base64: string; mime: string; preview: string }[]>([])
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [products, setProducts] = useState<ProductDraft[]>([])
  const [publishing, setPublishing] = useState(false)
  const [publishedCount, setPublishedCount] = useState(0)
  const [noProducer, setNoProducer] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    getToken().then(token => {
      if (!token) return
      fetch('/api/mon-producteur', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (!d.producer) setNoProducer(true) })
        .catch(() => {})
    })
  }, [])

  function addPhotos(files: FileList | null) {
    if (!files) return
    Array.from(files).slice(0, 5 - photos.length).forEach(file => {
      const reader = new FileReader()
      reader.onload = e => {
        const dataUrl = e.target?.result as string
        const base64 = dataUrl.split(',')[1]
        setPhotos(p => [...p, { base64, mime: file.type, preview: dataUrl }])
      }
      reader.readAsDataURL(file)
    })
  }

  function toggleMic() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(' ')
      setText(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  async function analyse() {
    setScanning(true)
    const token = await getToken()
    if (!token) { setScanning(false); return }

    const body = captureMode === 'photos'
      ? { images: photos.map(p => p.base64), mimeTypes: photos.map(p => p.mime), text }
      : { text }

    const res = await fetch('/api/mon-producteur/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    setProducts((d.products ?? []).map((p: Omit<ProductDraft, 'selected'>) => ({ ...p, prix_indicatif: p.prix_indicatif ?? '', periode_dispo: p.periode_dispo ?? '', selected: true })))
    setScanning(false)
    setStep('review')
  }

  async function publish() {
    setPublishing(true)
    const token = await getToken()
    if (!token) { setPublishing(false); return }

    const toPublish = products.filter(p => p.selected)
    let count = 0
    for (const p of toPublish) {
      const res = await fetch('/api/mon-producteur/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: p.nom, categorie: p.categorie,
          prix_indicatif: p.prix_indicatif || null,
          disponible: p.disponible,
          periode_dispo: p.periode_dispo || null,
        }),
      })
      if (res.ok) count++
    }
    setPublishedCount(count)
    setPublishing(false)
    setStep('mode') // reset for feedback
    setTimeout(onClose, 1800)
  }

  const canAnalyse = captureMode === 'photos' ? photos.length > 0 : text.trim().length > 0

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500,
        backgroundColor: '#FDFAF5', borderRadius: '20px 20px 0 0',
        padding: '0 0 env(safe-area-inset-bottom)',
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 12px', borderBottom: '1px solid #EDE8E0' }}>
          {step !== 'mode' && (
            <button onClick={() => setStep(step === 'review' ? 'capture' : 'mode')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8A8A8A', padding: 0, lineHeight: 1 }}>←</button>
          )}
          <h2 style={{ flex: 1, margin: 0, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: '#2C1810' }}>
            {step === 'mode' ? '+ Ajouter des produits' : step === 'capture' ? (captureMode === 'photos' ? '📷 Photos' : '✍️ Description') : '✅ Vérifier les produits'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8A8A8A', padding: 0, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>

          {/* Message si pas de fiche */}
          {noProducer && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>🌿</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#8A8A8A', lineHeight: 1.6 }}>
                Créez d&apos;abord votre fiche dans <strong>Mon espace → Ma fiche</strong>.
              </p>
            </div>
          )}

          {/* Succès */}
          {publishedCount > 0 && step === 'mode' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>🎉</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: '#2C1810' }}>
                {publishedCount} produit{publishedCount > 1 ? 's' : ''} publié{publishedCount > 1 ? 's' : ''} !
              </p>
            </div>
          )}

          {/* Step 1 — Choix du mode */}
          {!noProducer && step === 'mode' && publishedCount === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: '0 0 8px', fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6B6B6B' }}>
                Comment voulez-vous ajouter vos produits ?
              </p>
              {[
                { id: 'photos', icon: '📷', label: 'Photos', desc: 'Prenez des photos — l\'IA détecte vos produits' },
                { id: 'texte', icon: '✍️', label: 'Texte / voix', desc: 'Décrivez ou dictez vos produits' },
              ].map(m => (
                <button key={m.id} onClick={() => { setCaptureMode(m.id as 'photos' | 'texte'); setStep('capture') }} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
                  borderRadius: 16, border: '1.5px solid #EDE8E0', backgroundColor: '#fff',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{m.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810' }}>{m.label}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#8A8A8A', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>{m.desc}</p>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#CCC', fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2a — Photos */}
          {!noProducer && step === 'capture' && captureMode === 'photos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>
                Ajoutez jusqu&apos;à 5 photos de vos produits (étalage, aliments, artisanat…)
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                    <img src={p.preview} alt="" style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover' }} />
                    <button onClick={() => setPhotos(pp => pp.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#E8622A', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: '22px', textAlign: 'center' }}>×</button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button onClick={() => fileRef.current?.click()} style={{
                    width: 80, height: 80, borderRadius: 10,
                    border: '2px dashed #CCC', background: 'none', cursor: 'pointer',
                    fontSize: 28, color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>+</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }}
                onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6B6B6B', fontFamily: 'Inter, sans-serif', display: 'block', marginBottom: 4 }}>
                  Contexte optionnel (prix, saison…)
                </label>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
                  placeholder="Ex: tomates cerises 2€/barquette, courgettes de saison…"
                  style={{ ...inp, resize: 'none', lineHeight: 1.5 }} />
              </div>

              <button onClick={analyse} disabled={!canAnalyse || scanning} style={{
                padding: '14px', borderRadius: 12, border: 'none', cursor: canAnalyse && !scanning ? 'pointer' : 'default',
                backgroundColor: canAnalyse && !scanning ? 'var(--primary)' : '#CCC',
                color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15,
              }}>
                {scanning ? '⏳ Analyse en cours…' : '🔍 Analyser avec l\'IA'}
              </button>
            </div>
          )}

          {/* Step 2b — Texte / voix */}
          {!noProducer && step === 'capture' && captureMode === 'texte' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>
                Décrivez vos produits : noms, prix, disponibilité, quantités…
              </p>
              <div style={{ position: 'relative' }}>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
                  placeholder="Ex: j'ai des tomates cerises à 2€ la barquette disponibles cette semaine, des courgettes à 1€/kg, du miel de lavande 8€ le pot de 250g…"
                  style={{ ...inp, resize: 'none', lineHeight: 1.6, paddingRight: 48, minHeight: 140 }} />
                <button onClick={toggleMic} title={listening ? 'Arrêter' : 'Dicter'} style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  backgroundColor: listening ? '#E8622A' : '#EDE8E0',
                  color: listening ? '#fff' : '#6B6B6B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>
                  🎤
                </button>
              </div>
              {listening && (
                <p style={{ margin: 0, fontSize: 12, color: '#E8622A', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
                  🔴 Écoute en cours… Parlez maintenant
                </p>
              )}

              <button onClick={analyse} disabled={!canAnalyse || scanning} style={{
                padding: '14px', borderRadius: 12, border: 'none', cursor: canAnalyse && !scanning ? 'pointer' : 'default',
                backgroundColor: canAnalyse && !scanning ? 'var(--primary)' : '#CCC',
                color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15,
              }}>
                {scanning ? '⏳ Analyse en cours…' : '🔍 Analyser avec l\'IA'}
              </button>
            </div>
          )}

          {/* Step 3 — Review */}
          {!noProducer && step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {products.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>🤔</p>
                  <p style={{ fontSize: 14, color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>Aucun produit détecté. Essayez avec une photo plus nette ou une description plus précise.</p>
                  <button onClick={() => setStep('capture')} style={{ marginTop: 12, padding: '10px 24px', borderRadius: 999, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, cursor: 'pointer' }}>Réessayer</button>
                </div>
              )}

              {products.map((p, i) => (
                <div key={i} style={{
                  backgroundColor: '#fff', borderRadius: 14, padding: 14,
                  border: p.selected ? '1.5px solid var(--primary)' : '1.5px solid #EDE8E0',
                  opacity: p.selected ? 1 : 0.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => setProducts(pp => pp.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                      style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${p.selected ? 'var(--primary)' : '#CCC'}`, backgroundColor: p.selected ? 'var(--primary)' : 'transparent', flexShrink: 0, cursor: 'pointer' }}>
                      {p.selected && <svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <input value={p.nom} onChange={e => setProducts(pp => pp.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))}
                      style={{ ...inp, fontWeight: 700, flex: 1, padding: '6px 10px' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select value={p.categorie} onChange={e => setProducts(pp => pp.map((x, j) => j === i ? { ...x, categorie: e.target.value } : x))}
                      style={{ ...inp, padding: '6px 10px' }}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input value={p.prix_indicatif} onChange={e => setProducts(pp => pp.map((x, j) => j === i ? { ...x, prix_indicatif: e.target.value } : x))}
                      placeholder="Prix (ex: 3€/kg)" style={{ ...inp, padding: '6px 10px' }} />
                    <select value={p.periode_dispo} onChange={e => setProducts(pp => pp.map((x, j) => j === i ? { ...x, periode_dispo: e.target.value } : x))}
                      style={{ ...inp, padding: '6px 10px' }}>
                      <option value="">Sans limite</option>
                      <option value="semaine">Cette semaine</option>
                      <option value="weekend">Ce weekend</option>
                    </select>
                    <button onClick={() => setProducts(pp => pp.map((x, j) => j === i ? { ...x, disponible: !x.disponible } : x))}
                      style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${p.disponible ? 'var(--primary)' : '#CCC'}`, backgroundColor: p.disponible ? 'var(--primary-light)' : 'transparent', color: p.disponible ? 'var(--primary)' : '#8A8A8A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                      {p.disponible ? '✓ Disponible' : 'Indisponible'}
                    </button>
                  </div>
                </div>
              ))}

              {products.length > 0 && (
                <button onClick={publish} disabled={publishing || products.filter(p => p.selected).length === 0} style={{
                  marginTop: 8, padding: '14px', borderRadius: 12, border: 'none',
                  backgroundColor: publishing || products.filter(p => p.selected).length === 0 ? '#CCC' : 'var(--primary)',
                  color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15,
                  cursor: publishing ? 'default' : 'pointer',
                }}>
                  {publishing ? 'Publication…' : `Publier ${products.filter(p => p.selected).length} produit${products.filter(p => p.selected).length > 1 ? 's' : ''} →`}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
