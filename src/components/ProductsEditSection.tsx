'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PRODUIT_CATS } from '@/lib/produit-cats'

interface Product {
  id: string; nom: string; categorie: string; prix_indicatif: string | null
  disponible: boolean; periode_dispo: string | null; dispo_jusqu_au: string | null
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 10, border: '1px solid #DDD', fontFamily: 'Inter, sans-serif',
  fontSize: 14, color: '#2C1810', outline: 'none', backgroundColor: '#FAFAFA',
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export default function ProductsEditSection({ producerId }: { producerId: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [addingProduct, setAddingProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ nom: '', categorie: 'fruits_legumes', prix_indicatif: '', disponible: true, periode_dispo: '', dispo_jusqu_au: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('producer_id', producerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProducts(data ?? []))
  }, [producerId])

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
    if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? d.product : x)) }
  }

  async function updatePeriod(p: Product, periode_dispo: string, dispo_jusqu_au: string) {
    const token = await getToken()
    const res = await fetch(`/api/mon-producteur/products/${p.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: p.disponible, periode_dispo: periode_dispo || null, dispo_jusqu_au: dispo_jusqu_au || null }),
    })
    if (res.ok) { const d = await res.json(); setProducts(prev => prev.map(x => x.id === p.id ? d.product : x)) }
  }

  async function deleteProduct(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/mon-producteur/products/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setProducts(prev => prev.filter(x => x.id !== id))
  }

  async function addProduct() {
    if (!newProduct.nom.trim()) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch('/api/mon-producteur/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: newProduct.nom, categorie: newProduct.categorie,
        prix_indicatif: newProduct.prix_indicatif || null,
        disponible: newProduct.disponible,
        periode_dispo: newProduct.periode_dispo || null,
        dispo_jusqu_au: newProduct.dispo_jusqu_au || null,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      setProducts(prev => [d.product, ...prev])
      setNewProduct({ nom: '', categorie: 'fruits_legumes', prix_indicatif: '', disponible: true, periode_dispo: '', dispo_jusqu_au: '' })
      setAddingProduct(false)
    }
    setSaving(false)
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0 }}>Mes produits</h3>
        <button onClick={() => setAddingProduct(true)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
      </div>

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

      {products.map(p => (
        <div key={p.id} style={{ borderTop: '1px solid #F0EDE8', paddingTop: 12, paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => toggleDisponible(p)} style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', backgroundColor: p.disponible ? 'var(--primary)' : '#CCC', position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', left: p.disponible ? 20 : 2 }} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 14, color: '#2C1810', margin: 0 }}>{p.nom}</p>
              <p style={{ fontSize: 12, color: '#8A8A8A', margin: 0 }}>{p.categorie}{p.prix_indicatif ? ` · ${p.prix_indicatif}` : ''}</p>
            </div>
            <button onClick={() => deleteProduct(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#CCC', padding: '4px 6px' }}>🗑</button>
          </div>
          {p.disponible && (
            <div style={{ marginTop: 8, marginLeft: 52 }}>
              <select value={p.periode_dispo ?? ''} onChange={e => updatePeriod(p, e.target.value, p.dispo_jusqu_au ?? '')} style={{ ...inp, fontSize: 12, padding: '6px 10px' }}>
                <option value="">Sans limite</option>
                <option value="semaine">Cette semaine</option>
                <option value="weekend">Ce weekend</option>
                <option value="date">Jusqu&apos;au...</option>
              </select>
              {p.periode_dispo === 'date' && (
                <input type="date" style={{ ...inp, fontSize: 12, padding: '6px 10px', marginTop: 6 }} value={p.dispo_jusqu_au ?? ''} onChange={e => updatePeriod(p, 'date', e.target.value)} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
