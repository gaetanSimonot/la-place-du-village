'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PRODUIT_CATS, PRODUIT_CATS_MAP, normalizeProduitCat } from '@/lib/produit-cats'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'

interface Product {
  id: string; nom: string; categorie: string; prix_indicatif: string | null
  disponible: boolean; periode_dispo: string | null; dispo_jusqu_au: string | null
  image_url: string | null
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  borderRadius: 8, border: '1px solid #DDD', fontFamily: 'var(--font-body), sans-serif',
  fontSize: 13, color: '#2C1810', outline: 'none', backgroundColor: '#FAFAFA',
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export default function EtabProductsSection({ etabId }: { etabId: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [addingProduct, setAddingProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ nom: '', categorie: 'fruits_legumes', prix_indicatif: '', disponible: true, periode_dispo: '', dispo_jusqu_au: '' })
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ nom: '', categorie: '', prix_indicatif: '' })
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch(`/api/etablissements/${etabId}/products`)
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
  }, [etabId])

  async function toggleDisponible(p: Product) {
    const token = await getToken()
    const newVal = !p.disponible
    const body: Record<string, unknown> = { disponible: newVal }
    if (!newVal) { body.periode_dispo = null; body.dispo_jusqu_au = null }
    const res = await fetch(`/api/etablissements/${etabId}/products/${p.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? { ...d.product, image_url: p.image_url } : x)) }
  }

  async function updatePeriod(p: Product, periode_dispo: string, dispo_jusqu_au: string) {
    const token = await getToken()
    const res = await fetch(`/api/etablissements/${etabId}/products/${p.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: p.disponible, periode_dispo: periode_dispo || null, dispo_jusqu_au: dispo_jusqu_au || null }),
    })
    if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? { ...d.product, image_url: p.image_url } : x)) }
  }

  async function saveEdit(id: string) {
    setSavingEditId(id)
    const token = await getToken()
    const res = await fetch(`/api/etablissements/${etabId}/products/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: editDraft.nom, categorie: editDraft.categorie, prix_indicatif: editDraft.prix_indicatif || null }),
    })
    if (res.ok) {
      const d = await res.json()
      setProducts(prev => prev.map(x => x.id === id ? { ...d.product, image_url: x.image_url } : x).sort((a, b) => a.categorie.localeCompare(b.categorie)))
    }
    setSavingEditId(null); setEditingId(null)
  }

  async function deleteProduct(id: string) {
    setDeletingId(id)
    setProducts(prev => prev.filter(x => x.id !== id))
    const token = await getToken()
    const res = await fetch(`/api/etablissements/${etabId}/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      fetch(`/api/etablissements/${etabId}/products`).then(r => r.json()).then(d => setProducts(d.products ?? []))
    }
    setDeletingId(null)
  }

  async function addProduct() {
    if (!newProduct.nom.trim()) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/etablissements/${etabId}/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: newProduct.nom, categorie: newProduct.categorie, prix_indicatif: newProduct.prix_indicatif || null, disponible: newProduct.disponible, periode_dispo: newProduct.periode_dispo || null, dispo_jusqu_au: newProduct.dispo_jusqu_au || null }),
    })
    if (res.ok) {
      const d = await res.json()
      setProducts(prev => [...prev, d.product].sort((a, b) => a.categorie.localeCompare(b.categorie)))
      setNewProduct({ nom: '', categorie: 'fruits_legumes', prix_indicatif: '', disponible: true, periode_dispo: '', dispo_jusqu_au: '' })
      setAddingProduct(false)
    }
    setSaving(false)
  }

  async function uploadImage(p: Product, file: File) {
    setUploadingId(p.id)
    try {
      // Upload direct browser -> Supabase via signed URL (zero transit Vercel)
      const compressed = await compressImage(file, { maxDim: 1024, quality: 0.82 })
      const { publicUrl } = await uploadViaSignedUrl({
        file: compressed, kind: 'product-image', refId: p.id,
      })
      // Finalise cote serveur : ecrit image_url en DB + ownership re-check
      const token = await getToken()
      const res = await fetch(`/api/etablissements/${etabId}/products/${p.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: publicUrl }),
      })
      if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? { ...x, image_url: d.url } : x)) }
    } finally { setUploadingId(null) }
  }

  const byCategory: Record<string, Product[]> = {}
  products.forEach(p => {
    const cat = normalizeProduitCat(p.categorie)
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(p)
  })

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0 }}>Produits & services</h3>
        <button onClick={() => setAddingProduct(true)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
      </div>

      {addingProduct && (
        <div style={{ backgroundColor: '#F8F7F4', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <input style={inp} placeholder="Nom du produit / service *" value={newProduct.nom} onChange={e => setNewProduct(p => ({ ...p, nom: e.target.value }))} />
            <select style={inp} value={newProduct.categorie} onChange={e => setNewProduct(p => ({ ...p, categorie: e.target.value }))}>
              {PRODUIT_CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <input style={inp} placeholder="Prix indicatif (ex: 3€/kg)" value={newProduct.prix_indicatif} onChange={e => setNewProduct(p => ({ ...p, prix_indicatif: e.target.value }))} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-body), sans-serif', color: '#2C1810' }}>Disponible</span>
              <button onClick={() => setNewProduct(p => ({ ...p, disponible: !p.disponible }))} style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', backgroundColor: newProduct.disponible ? '#2D5A3D' : '#CCC', position: 'relative' }}>
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
            <button onClick={() => setAddingProduct(false)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #DDD', background: 'none', fontFamily: 'var(--font-body), sans-serif', fontSize: 14, cursor: 'pointer', color: '#6B6B6B' }}>Annuler</button>
            <button onClick={addProduct} disabled={saving || !newProduct.nom.trim()} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', backgroundColor: saving || !newProduct.nom.trim() ? '#CCC' : '#2D5A3D', color: '#fff', fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {saving ? '...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {products.length === 0 && !addingProduct && (
        <p style={{ fontSize: 13, color: '#8A8A8A', textAlign: 'center', padding: '16px 0', margin: 0 }}>Aucun produit. Ajoutez vos premiers produits !</p>
      )}

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
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
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
                      <input ref={el => { fileRefs.current[p.id] = el }} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) uploadImage(p, e.target.files[0]); e.target.value = '' }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input style={inp} value={editDraft.nom} onChange={e => setEditDraft(d => ({ ...d, nom: e.target.value }))} placeholder="Nom" autoFocus />
                          <select style={inp} value={editDraft.categorie} onChange={e => setEditDraft(d => ({ ...d, categorie: e.target.value }))}>
                            {PRODUIT_CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                          </select>
                          <input style={inp} value={editDraft.prix_indicatif} onChange={e => setEditDraft(d => ({ ...d, prix_indicatif: e.target.value }))} placeholder="Prix (ex: 3€/kg)" />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #DDD', background: 'none', fontSize: 13, cursor: 'pointer', color: '#6B6B6B' }}>Annuler</button>
                            <button onClick={() => saveEdit(p.id)} disabled={savingEditId === p.id} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', backgroundColor: savingEditId === p.id ? '#CCC' : '#2D5A3D', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                              {savingEditId === p.id ? '...' : '✓ Enregistrer'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <button onClick={() => toggleDisponible(p)} style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', backgroundColor: p.disponible ? '#2D5A3D' : '#CCC', position: 'relative', flexShrink: 0 }}>
                              <span style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', left: p.disponible ? 18 : 2 }} />
                            </button>
                            <p style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14, color: '#2C1810', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</p>
                          </div>
                          {p.prix_indicatif && <p style={{ fontSize: 12, color: '#8A8A8A', margin: '0 0 6px' }}>{p.prix_indicatif}</p>}
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => { setEditingId(p.id); setEditDraft({ nom: p.nom, categorie: normalizeProduitCat(p.categorie), prix_indicatif: p.prix_indicatif ?? '' }) }}
                              style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #DDD', background: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#2D5A3D', fontFamily: 'var(--font-body), sans-serif' }}>
                              ✏️ Éditer
                            </button>
                            <button onClick={() => deleteProduct(p.id)} disabled={isDeleting}
                              style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #FCD5C8', background: '#FEF2EF', fontSize: 11, cursor: isDeleting ? 'default' : 'pointer', color: '#C84B2F', fontFamily: 'var(--font-body), sans-serif' }}>
                              {isDeleting ? '…' : '🗑️'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

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
  )
}
