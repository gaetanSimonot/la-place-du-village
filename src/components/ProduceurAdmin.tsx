'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const PRODUIT_CATS = [
  { id: 'oeufs', label: 'Œufs' }, { id: 'legumes', label: 'Légumes' },
  { id: 'fromage', label: 'Fromage' }, { id: 'lait', label: 'Lait' },
  { id: 'pain', label: 'Pain' }, { id: 'volaille', label: 'Volaille' },
  { id: 'miel', label: 'Miel' }, { id: 'panier', label: 'Panier' },
  { id: 'fruits', label: 'Fruits' }, { id: 'viande', label: 'Viande' },
  { id: 'artisanat', label: 'Artisanat' }, { id: 'autre', label: 'Autre' },
]

interface Product { id: string; nom: string; categorie: string; prix_indicatif: string | null; disponible: boolean }
interface Producteur {
  id: string; user_id: string | null; nom: string
  description_courte: string | null; description_longue: string | null
  commune: string | null; adresse: string | null
  lat: number | null; lng: number | null
  contact_whatsapp: string | null; contact_tel: string | null
  photos: string[]; is_max: boolean; products: Product[]
}

const emptyForm = () => ({
  nom: '', user_email: '', description_courte: '', description_longue: '',
  commune: '', adresse: '', lat: '', lng: '',
  contact_whatsapp: '', contact_tel: '',
  photo_url: '', is_max: false,
})

export default function ProduceurAdmin({ embedded }: { embedded?: boolean }) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [adminVerified, setAdminVerified] = useState(embedded ?? false)

  useEffect(() => {
    if (adminVerified || embedded || authLoading) return
    if (!user?.email) { router.replace('/'); return }
    supabase.from('admin_emails').select('email').eq('email', user.email).maybeSingle()
      .then(({ data, error }) => {
        if (error) return
        if (!data) { if (!embedded) router.replace('/') }
        else setAdminVerified(true)
      })
  }, [adminVerified, embedded, authLoading, user, router])

  const [producers, setProducers] = useState<Producteur[]>([])
  const [editId, setEditId]       = useState<string | 'new' | null>(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [acQuery, setAcQuery]     = useState('')
  const [acResults, setAcResults] = useState<{ place_id: string; description: string }[]>([])
  const [newProd, setNewProd]     = useState({ nom: '', categorie: 'legumes', prix_indicatif: '', disponible: true })
  const [uploading, setUploading] = useState(false)

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const fetchAll = useCallback(async () => {
    const t = await token()
    const r = await fetch('/api/admin/producteurs', { headers: { Authorization: `Bearer ${t}` } })
    const d = await r.json()
    setProducers(d.producers ?? [])
  }, [token])

  useEffect(() => { if (adminVerified) fetchAll() }, [adminVerified, fetchAll])

  const openEdit = (p: Producteur) => {
    setEditId(p.id)
    setForm({
      nom: p.nom, user_email: '',
      description_courte: p.description_courte ?? '',
      description_longue: p.description_longue ?? '',
      commune: p.commune ?? '', adresse: p.adresse ?? '',
      lat: p.lat?.toString() ?? '', lng: p.lng?.toString() ?? '',
      contact_whatsapp: p.contact_whatsapp ?? '',
      contact_tel: p.contact_tel ?? '',
      photo_url: p.photos[0] ?? '',
      is_max: p.is_max,
    })
    setErr('')
  }

  const openNew = () => { setEditId('new'); setForm(emptyForm()); setErr('') }
  const cancel  = () => { setEditId(null); setAcResults([]); setAcQuery('') }

  const save = async () => {
    if (!form.nom.trim()) { setErr('Le nom est requis'); return }
    setSaving(true); setErr('')
    const t = await token()
    const body = {
      nom: form.nom, user_email: form.user_email || undefined,
      description_courte: form.description_courte || null,
      description_longue: form.description_longue || null,
      commune: form.commune || null, adresse: form.adresse || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      contact_whatsapp: form.contact_whatsapp || null,
      contact_tel: form.contact_tel || null,
      photos: form.photo_url ? [form.photo_url] : [],
      is_max: form.is_max,
    }
    const isNew = editId === 'new'
    const url = isNew ? '/api/admin/producteurs' : `/api/admin/producteurs/${editId}`
    const r = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (d.error) { setErr(d.error); setSaving(false); return }
    await fetchAll()
    if (isNew) setEditId(d.producer.id)
    setSaving(false)
  }

  const deleteProducer = async (id: string) => {
    if (!confirm('Supprimer ce producteur ?')) return
    const t = await token()
    await fetch(`/api/admin/producteurs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
    await fetchAll()
    if (editId === id) cancel()
  }

  // Autocomplete localisation
  useEffect(() => {
    if (acQuery.length < 3) { setAcResults([]); return }
    const tid = setTimeout(async () => {
      const r = await fetch(`/api/admin/autocomplete?q=${encodeURIComponent(acQuery)}`)
      const d = await r.json()
      setAcResults(d.predictions ?? [])
    }, 300)
    return () => clearTimeout(tid)
  }, [acQuery])

  const geocode = async (place_id: string, desc: string) => {
    setAcQuery(desc); setAcResults([])
    const r = await fetch(`/api/admin/geocode?place_id=${place_id}`)
    const d = await r.json()
    if (d.lat) setForm(f => ({ ...f, lat: String(d.lat), lng: String(d.lng), commune: d.commune || f.commune, adresse: d.adresse || f.adresse }))
  }

  // Upload photo
  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      const t = await token()
      const r = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ base64, mimeType: file.type }),
      })
      const d = await r.json()
      if (d.url) setForm(f => ({ ...f, photo_url: d.url }))
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  // Ajouter un produit
  const addProduct = async () => {
    if (!newProd.nom.trim() || editId === 'new' || !editId) return
    const t = await token()
    const r = await fetch(`/api/admin/producteurs/${editId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(newProd),
    })
    if (r.ok) { await fetchAll(); setNewProd({ nom: '', categorie: 'legumes', prix_indicatif: '', disponible: true }) }
  }

  const toggleDispo = async (producerId: string, productId: string, current: boolean) => {
    const t = await token()
    await fetch(`/api/admin/producteurs/${producerId}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ disponible: !current }),
    })
    await fetchAll()
  }

  const deleteProduct = async (producerId: string, productId: string) => {
    const t = await token()
    await fetch(`/api/admin/producteurs/${producerId}/products/${productId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${t}` },
    })
    await fetchAll()
  }

  if (!adminVerified) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#C4622D', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
    </div>
  )

  const editing = editId ? producers.find(p => p.id === editId) : null

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid #E0D8CE', fontSize: 13, outline: 'none',
    backgroundColor: '#FBF7F0', color: '#2C1810', boxSizing: 'border-box',
    fontFamily: 'Inter, sans-serif',
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Inter, sans-serif', display: 'block', marginBottom: 4 }
  const sectionStyle: React.CSSProperties = { marginBottom: 14 }

  return (
    <div style={{ backgroundColor: '#FBF7F0', fontFamily: 'Inter, sans-serif', minHeight: embedded ? undefined : '100dvh' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header — standalone only */}
      {!embedded && (
        <div style={{ backgroundColor: '#2C1810', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <Link href="/admin" style={{ color: '#C4622D', fontWeight: 800, fontSize: 18, textDecoration: 'none' }}>←</Link>
          <h1 style={{ fontWeight: 700, fontSize: 16, margin: 0, flex: 1 }}>Producteurs locaux</h1>
          <button onClick={openNew} style={{ backgroundColor: '#C4622D', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Nouveau
          </button>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px' }}>

        {/* Formulaire création/édition */}
        {editId && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '20px 16px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontWeight: 800, fontSize: 16, margin: 0, color: '#1A1209' }}>{editId === 'new' ? 'Nouveau producteur' : `Modifier : ${editing?.nom ?? ''}`}</h2>
              <button onClick={cancel} style={{ background: 'none', border: 'none', color: '#9A8A7A', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nom de la ferme / du projet *</label>
                <input style={inputStyle} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="La Ferme des Oliviers" />
              </div>

              <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Email utilisateur (pour lier le compte)</label>
                <input style={inputStyle} type="email" value={form.user_email} onChange={e => setForm(f => ({ ...f, user_email: e.target.value }))} placeholder="utilisateur@email.com" />
              </div>

              <div style={{ ...sectionStyle, gridColumn: '1 / -1', position: 'relative' }}>
                <label style={labelStyle}>Adresse / localisation</label>
                <input style={inputStyle} value={acQuery || form.adresse} onChange={e => { setAcQuery(e.target.value); setForm(f => ({ ...f, adresse: e.target.value })) }} placeholder="Chemin du Moulin, Ganges…" />
                {acResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, backgroundColor: '#fff', borderRadius: 8, border: '1.5px solid #E0D8CE', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: 2 }}>
                    {acResults.slice(0, 5).map(r => (
                      <button key={r.place_id} onClick={() => geocode(r.place_id, r.description)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#2C1810', borderBottom: '1px solid #F0EBE0' }}>
                        {r.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={sectionStyle}>
                <label style={labelStyle}>Commune</label>
                <input style={inputStyle} value={form.commune} onChange={e => setForm(f => ({ ...f, commune: e.target.value }))} placeholder="Ganges" />
              </div>

              <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Latitude</label>
                  <input style={inputStyle} value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="43.933" />
                </div>
                <div>
                  <label style={labelStyle}>Longitude</label>
                  <input style={inputStyle} value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="3.700" />
                </div>
              </div>

              <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Description courte</label>
                <input style={inputStyle} value={form.description_courte} onChange={e => setForm(f => ({ ...f, description_courte: e.target.value }))} placeholder="Maraîcher bio en agriculture de conservation…" />
              </div>

              <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Description longue</label>
                <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={form.description_longue} onChange={e => setForm(f => ({ ...f, description_longue: e.target.value }))} placeholder="Histoire de la ferme, valeurs, méthodes…" />
              </div>

              <div style={sectionStyle}>
                <label style={labelStyle}>WhatsApp</label>
                <input style={inputStyle} value={form.contact_whatsapp} onChange={e => setForm(f => ({ ...f, contact_whatsapp: e.target.value }))} placeholder="+33 6 00 00 00 00" />
              </div>

              <div style={sectionStyle}>
                <label style={labelStyle}>Téléphone</label>
                <input style={inputStyle} value={form.contact_tel} onChange={e => setForm(f => ({ ...f, contact_tel: e.target.value }))} placeholder="+33 4 00 00 00 00" />
              </div>

              <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Photo principale</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {form.photo_url && <img src={form.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} id="photo-upload" />
                    <label htmlFor="photo-upload" style={{ display: 'inline-block', padding: '8px 14px', backgroundColor: '#E8F2EB', color: '#2D5A3D', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {uploading ? 'Upload…' : 'Choisir une image'}
                    </label>
                    <input style={{ ...inputStyle, marginTop: 6 }} value={form.photo_url} onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))} placeholder="Ou coller une URL" />
                  </div>
                </div>
              </div>

              <div style={{ ...sectionStyle, gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="is_max" checked={form.is_max} onChange={e => setForm(f => ({ ...f, is_max: e.target.checked }))} style={{ width: 18, height: 18 }} />
                <label htmlFor="is_max" style={{ fontSize: 13, color: '#2C1810', cursor: 'pointer' }}>Abonnement Max actif (fiche enrichie + pin mis en avant)</label>
              </div>
            </div>

            {err && <p style={{ color: '#E53935', fontSize: 12, marginTop: 8 }}>{err}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: '12px', backgroundColor: '#2D5A3D', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={cancel} style={{ padding: '12px 16px', backgroundColor: '#F0EBE0', color: '#6B5E4E', border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>

            {/* Produits — uniquement si producteur existant */}
            {editId !== 'new' && editing && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #F0EBE0' }}>
                <h3 style={{ fontWeight: 700, fontSize: 14, margin: '0 0 12px', color: '#1A1209' }}>Produits proposés</h3>

                {editing.products.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F0EBE0' }}>
                    <button onClick={() => toggleDispo(editing.id, p.id, p.disponible)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', backgroundColor: p.disponible ? '#E8F2EB' : '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {p.disponible ? '✓' : '✕'}
                    </button>
                    <span style={{ flex: 1, fontSize: 13, color: p.disponible ? '#1A1209' : '#9A8A7A', textDecoration: p.disponible ? 'none' : 'line-through' }}>{p.nom}</span>
                    <span style={{ fontSize: 11, color: '#7A6A5A', backgroundColor: '#F5F0E8', padding: '2px 7px', borderRadius: 999 }}>{PRODUIT_CATS.find(c => c.id === p.categorie)?.label ?? p.categorie}</span>
                    {p.prix_indicatif && <span style={{ fontSize: 11, color: '#7A6A5A' }}>{p.prix_indicatif}</span>}
                    <button onClick={() => deleteProduct(editing.id, p.id)} style={{ background: 'none', border: 'none', color: '#E53935', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  <input style={{ ...inputStyle, flex: 2, minWidth: 120 }} value={newProd.nom} onChange={e => setNewProd(p => ({ ...p, nom: e.target.value }))} placeholder="Nom du produit" onKeyDown={e => e.key === 'Enter' && addProduct()} />
                  <select style={{ ...inputStyle, flex: 1, minWidth: 100 }} value={newProd.categorie} onChange={e => setNewProd(p => ({ ...p, categorie: e.target.value }))}>
                    {PRODUIT_CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <input style={{ ...inputStyle, flex: 1, minWidth: 80 }} value={newProd.prix_indicatif} onChange={e => setNewProd(p => ({ ...p, prix_indicatif: e.target.value }))} placeholder="Prix (ex: 4€/dz)" />
                  <button onClick={addProduct} style={{ padding: '9px 14px', backgroundColor: '#2D5A3D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    + Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Liste des producteurs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontWeight: 700, fontSize: 14, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            {producers.length} producteur{producers.length !== 1 ? 's' : ''}
          </h2>
          {embedded && (
            <button onClick={openNew} style={{ backgroundColor: '#C4622D', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Nouveau
            </button>
          )}
        </div>

        {producers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9A8A7A' }}>
            <p style={{ fontSize: 40, marginBottom: 8 }}>🌿</p>
            <p style={{ fontSize: 14 }}>Aucun producteur. Clique sur &ldquo;+ Nouveau&rdquo; pour en créer un.</p>
          </div>
        ) : (
          producers.map(p => (
            <div key={p.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', display: 'flex', gap: 12, alignItems: 'center', border: editId === p.id ? '2px solid #2D5A3D' : '2px solid transparent' }}>
              {p.photos[0] ? (
                <img src={p.photos[0]} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🌿</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', color: '#1A1209' }}>{p.nom} {p.is_max && <span style={{ fontSize: 10, backgroundColor: '#2D5A3D', color: '#fff', padding: '1px 6px', borderRadius: 999, marginLeft: 4 }}>MAX</span>}</p>
                <p style={{ fontSize: 11, color: '#7A6A5A', margin: 0 }}>{p.commune ?? '—'} · {p.products.length} produit{p.products.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => openEdit(p)} style={{ padding: '6px 12px', backgroundColor: '#F0EBE0', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#2C1810' }}>
                Modifier
              </button>
              <button onClick={() => deleteProducer(p.id)} style={{ background: 'none', border: 'none', color: '#E53935', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
