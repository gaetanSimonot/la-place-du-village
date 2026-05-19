'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PRODUIT_CATS, PRODUIT_CATS_MAP, normalizeProduitCat } from '@/lib/produit-cats'
import CaptureProducteur from '@/components/CaptureProducteur'

interface Product {
  id: string; nom: string; categorie: string; prix_indicatif: string | null
  disponible: boolean; periode_dispo: string | null; dispo_jusqu_au: string | null
  image_url: string | null
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  borderRadius: 8, border: '1px solid #DDD', fontFamily: 'Inter, sans-serif',
  fontSize: 13, color: '#2C1810', outline: 'none', backgroundColor: '#FAFAFA',
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function resizeImage(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = reject
    img.src = url
  })
}

export default function ProductsEditSection({ producerId }: { producerId: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [addingProduct, setAddingProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ nom: '', categorie: 'fruits_legumes', prix_indicatif: '', disponible: true, periode_dispo: '', dispo_jusqu_au: '' })
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ nom: '', categorie: '', prix_indicatif: '' })
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const autoFetchDone = useRef(false)

  useEffect(() => {
    supabase.from('products').select('*').eq('producer_id', producerId)
      .order('categorie', { ascending: true })
      .then(({ data }) => setProducts(data ?? []))
  }, [producerId])

  // Auto-fetch Pexels pour les produits sans image
  useEffect(() => {
    if (autoFetchDone.current || products.length === 0) return
    const missing = products.filter(p => !p.image_url)
    if (missing.length === 0) { autoFetchDone.current = true; return }
    autoFetchDone.current = true
    ;(async () => { for (const p of missing) await reloadPexels(p) })()
  }, [products]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleDisponible(p: Product) {
    const token = await getToken()
    const newVal = !p.disponible
    const body: Record<string, unknown> = { disponible: newVal }
    if (!newVal) { body.periode_dispo = null; body.dispo_jusqu_au = null }
    const res = await fetch(`/api/mon-producteur/products/${p.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? { ...d.product, image_url: p.image_url } : x)) }
  }

  async function updatePeriod(p: Product, periode_dispo: string, dispo_jusqu_au: string) {
    const token = await getToken()
    const res = await fetch(`/api/mon-producteur/products/${p.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: p.disponible, periode_dispo: periode_dispo || null, dispo_jusqu_au: dispo_jusqu_au || null }),
    })
    if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? { ...d.product, image_url: p.image_url } : x)) }
  }

  async function saveEdit(id: string) {
    setSavingEditId(id)
    const token = await getToken()
    const res = await fetch(`/api/mon-producteur/products/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: editDraft.nom, categorie: editDraft.categorie, prix_indicatif: editDraft.prix_indicatif || null }),
    })
    if (res.ok) {
      const d = await res.json()
      setProducts(prev => prev.map(x => x.id === id ? { ...d.product, image_url: x.image_url } : x).sort((a, b) => a.categorie.localeCompare(b.categorie)))
    }
    setSavingEditId(null)
    setEditingId(null)
  }

  async function deleteProduct(id: string) {
    setDeletingId(id)
    setProducts(prev => prev.filter(x => x.id !== id))
    const token = await getToken()
    const res = await fetch(`/api/mon-producteur/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      supabase.from('products').select('*').eq('producer_id', producerId).order('categorie', { ascending: true })
        .then(({ data }) => setProducts(data ?? []))
    }
    setDeletingId(null)
  }

  async function addProduct() {
    if (!newProduct.nom.trim()) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch('/api/mon-producteur/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: newProduct.nom, categorie: newProduct.categorie, prix_indicatif: newProduct.prix_indicatif || null, disponible: newProduct.disponible, periode_dispo: newProduct.periode_dispo || null, dispo_jusqu_au: newProduct.dispo_jusqu_au || null }),
    })
    const d = await res.json().catch(() => ({}))
    // [PDV-DEBUG-NOTIF] visible dans la console F12 — followersNotified + notifError
    const dbg = (d as { _debug?: { followersNotified?: number; notifError?: string | null } })._debug ?? {}
    console.log('[PDV-DEBUG-NOTIF] status=' + res.status + ' followersNotified=' + (dbg.followersNotified ?? 'undef') + ' notifError=' + (dbg.notifError ?? 'none'))
    console.log('[PDV-DEBUG-NOTIF] full body JSON =', JSON.stringify(d))
    if (res.ok) {
      setProducts(prev => [...prev, d.product].sort((a, b) => a.categorie.localeCompare(b.categorie)))
      setNewProduct({ nom: '', categorie: 'fruits_legumes', prix_indicatif: '', disponible: true, periode_dispo: '', dispo_jusqu_au: '' })
      setAddingProduct(false)
    }
    setSaving(false)
  }

  async function uploadImage(p: Product, file: File) {
    setUploadingId(p.id)
    try {
      const base64 = await resizeImage(file)
      const token = await getToken()
      const res = await fetch(`/api/mon-producteur/products/${p.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64 }),
      })
      if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? { ...x, image_url: d.url } : x)) }
    } finally { setUploadingId(null) }
  }

  async function reloadPexels(p: Product) {
    setUploadingId(p.id)
    try {
      const token = await getToken()
      const res = await fetch(`/api/mon-producteur/products/${p.id}/image`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        if (d.debug) console.warn('[Pexels]', d.debug, '— produit:', p.nom)
        if (d.url) setProducts(prev => prev.map(x => x.id === p.id ? { ...x, image_url: d.url } : x))
      }
    } finally { setUploadingId(null) }
  }

  const byCategory: Record<string, Product[]> = {}
  products.forEach(p => {
    const cat = normalizeProduitCat(p.categorie)
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(p)
  })

  return (
    <>
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0 }}>Mes produits</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCaptureOpen(true)} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #2D5A3D', backgroundColor: 'transparent', color: '#2D5A3D', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🎤 Dicter</button>
          <button onClick={() => setAddingProduct(true)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
      </div>

      {/* Formulaire ajout */}
      {addingProduct && (
        <div style={{ backgroundColor: '#F8F7F4', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <input style={inp} placeholder="Nom du produit *" value={newProduct.nom} onChange={e => setNewProduct(p => ({ ...p, nom: e.target.value }))} />
            <select style={inp} value={newProduct.categorie} onChange={e => setNewProduct(p => ({ ...p, categorie: e.target.value }))}>
              {PRODUIT_CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <input style={inp} placeholder="Prix indicatif (ex: 3€/kg)" value={newProduct.prix_indicatif} onChange={e => setNewProduct(p => ({ ...p, prix_indicatif: e.target.value }))} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#2C1810' }}>Disponible</span>
              <button onClick={() => setNewProduct(p => ({ ...p, disponible: !p.disponible }))} style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', backgroundColor: newProduct.disponible ? 'var(--primary)' : '#CCC', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', left: newProduct.disponible ? 20 : 2 }} />
              </button>
            </div>
            {newProduct.disponible && (
              <select style={inp} value={newProduct.periode_dispo} onChange={e => setNewProduct(p => ({ ...p, periode_dispo: e.target.value, dispo_jusqu_au: '' }))}>
                <option value="">Sans limite de temps</option>
                <option value="semaine">Cette semaine</option>
                <option value="weekend">Ce weekend</option>
                <option value="date">Jusqu&apos;au...</option>
              </select>
            )}
            {newProduct.disponible && newProduct.periode_dispo === 'date' && (
              <input type="date" style={inp} value={newProduct.dispo_jusqu_au} onChange={e => setNewProduct(p => ({ ...p, dispo_jusqu_au: e.target.value }))} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAddingProduct(false)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #DDD', background: 'none', fontFamily: 'Inter, sans-serif', fontSize: 14, cursor: 'pointer', color: '#6B6B6B' }}>Annuler</button>
            <button onClick={addProduct} disabled={saving || !newProduct.nom.trim()} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', backgroundColor: saving || !newProduct.nom.trim() ? '#CCC' : 'var(--primary)', color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {saving ? '...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {products.length === 0 && !addingProduct && (
        <p style={{ fontSize: 13, color: '#8A8A8A', textAlign: 'center', padding: '16px 0', margin: 0 }}>Aucun produit. Ajoutez vos premiers produits !</p>
      )}

      {/* Liste par catégorie */}
      {Object.entries(byCategory).map(([cat, prods]) => {
        const catInfo = PRODUIT_CATS_MAP[cat]
        return (
          <div key={cat}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8A7A6A', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {catInfo?.emoji} {catInfo?.label ?? cat}
            </p>
            {prods.map(p => {
              const isEditing = editingId === p.id
              const isDeleting = deletingId === p.id
              return (
                <div key={p.id} style={{ borderTop: '1px solid #F0EDE8', paddingTop: 12, paddingBottom: 12 }}>

                  {/* Ligne principale : photo + infos */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                    {/* Photo 80px cliquable */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: '1px solid #EDE8DF' }}
                        onClick={() => fileRefs.current[p.id]?.click()}>
                        {uploadingId === p.id
                          ? <div style={{ width: '100%', height: '100%', backgroundColor: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
                            </div>
                          : p.image_url
                            ? <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ width: '100%', height: '100%', backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{catInfo?.emoji ?? '✦'}</div>
                        }
                      </div>
                      {uploadingId !== p.id && (
                        <button onClick={() => reloadPexels(p)} title="Autre photo Pexels"
                          style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#5C3D1E', border: '2px solid #fff', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                          ↻
                        </button>
                      )}
                      <input ref={el => { fileRefs.current[p.id] = el }} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) uploadImage(p, e.target.files[0]); e.target.value = '' }} />
                    </div>

                    {/* Infos produit */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        /* Formulaire édition inline */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input style={inp} value={editDraft.nom} onChange={e => setEditDraft(d => ({ ...d, nom: e.target.value }))} placeholder="Nom" autoFocus />
                          <select style={inp} value={editDraft.categorie} onChange={e => setEditDraft(d => ({ ...d, categorie: e.target.value }))}>
                            {PRODUIT_CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                          </select>
                          <input style={inp} value={editDraft.prix_indicatif} onChange={e => setEditDraft(d => ({ ...d, prix_indicatif: e.target.value }))} placeholder="Prix (ex: 3€/kg)" />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #DDD', background: 'none', fontSize: 13, cursor: 'pointer', color: '#6B6B6B' }}>Annuler</button>
                            <button onClick={() => saveEdit(p.id)} disabled={savingEditId === p.id} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', backgroundColor: savingEditId === p.id ? '#CCC' : 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                              {savingEditId === p.id ? '...' : '✓ Enregistrer'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Affichage normal */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            {/* Toggle disponible */}
                            <button onClick={() => toggleDisponible(p)} style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', backgroundColor: p.disponible ? 'var(--primary)' : '#CCC', position: 'relative', flexShrink: 0 }}>
                              <span style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', left: p.disponible ? 18 : 2 }} />
                            </button>
                            <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#2C1810', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</p>
                          </div>
                          {p.prix_indicatif && <p style={{ fontSize: 12, color: '#8A8A8A', margin: '0 0 6px' }}>{p.prix_indicatif}</p>}

                          {/* Boutons actions */}
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => { setEditingId(p.id); setEditDraft({ nom: p.nom, categorie: normalizeProduitCat(p.categorie), prix_indicatif: p.prix_indicatif ?? '' }) }}
                              title="Modifier" style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #DDD', background: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#2D5A3D', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              Éditer
                            </button>
                            <button onClick={() => deleteProduct(p.id)} disabled={isDeleting} title="Supprimer"
                              style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #FCD5C8', background: '#FEF2EF', fontSize: 11, cursor: isDeleting ? 'default' : 'pointer', color: '#C84B2F', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 3 }}>
                              {isDeleting
                                ? <div style={{ width: 11, height: 11, borderRadius: '50%', border: '1.5px solid #FCD5C8', borderTopColor: '#C84B2F', animation: 'spin 0.7s linear infinite' }} />
                                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                                  </svg>
                              }
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Période dispo (hors édition) */}
                  {!isEditing && p.disponible && (
                    <div style={{ marginTop: 8, marginLeft: 92 }}>
                      <select value={p.periode_dispo ?? ''} onChange={e => updatePeriod(p, e.target.value, p.dispo_jusqu_au ?? '')} style={{ ...inp, fontSize: 12, padding: '5px 8px' }}>
                        <option value="">Sans limite</option>
                        <option value="semaine">Cette semaine</option>
                        <option value="weekend">Ce weekend</option>
                        <option value="date">Jusqu&apos;au...</option>
                      </select>
                      {p.periode_dispo === 'date' && (
                        <input type="date" style={{ ...inp, fontSize: 12, padding: '5px 8px', marginTop: 4 }} value={p.dispo_jusqu_au ?? ''} onChange={e => updatePeriod(p, 'date', e.target.value)} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>

    {captureOpen && (
      <CaptureProducteur onClose={() => {
        setCaptureOpen(false)
        supabase.from('products').select('*').eq('producer_id', producerId)
          .order('categorie', { ascending: true })
          .then(({ data }) => setProducts(data ?? []))
      }} />
    )}
  </>
  )
}
