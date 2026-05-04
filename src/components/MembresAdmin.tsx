'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Producer { id: string; nom: string; is_max: boolean; photo: string | null }
interface Membre {
  id: string; email: string; name: string; avatar: string
  created_at: string; last_sign_in: string | null
  producer: Producer | null
}

export default function MembresAdmin() {
  const [membres, setMembres] = useState<Membre[]>([])
  const [loading, setLoading]  = useState(true)
  const [search, setSearch]    = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const t = await token()
    const r = await fetch('/api/admin/membres', { headers: { Authorization: `Bearer ${t}` } })
    const d = await r.json()
    setMembres(d.membres ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggleMax = async (producerId: string, current: boolean) => {
    setToggling(producerId)
    const t = await token()
    await fetch('/api/admin/membres', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ producer_id: producerId, is_max: !current }),
    })
    await fetchAll()
    setToggling(null)
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })

  const filtered = membres.filter(m =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#9A8A7A', fontFamily: 'Inter, sans-serif' }}>
      Chargement des membres…
    </div>
  )

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Barre recherche + stats */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EBE0', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par email ou nom…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 13, outline: 'none', backgroundColor: '#FBF7F0', color: '#2C1810' }}
        />
        <span style={{ fontSize: 12, color: '#9A8A7A', whiteSpace: 'nowrap' }}>
          {filtered.length} / {membres.length} membres · {membres.filter(m => m.producer?.is_max).length} Max
        </span>
      </div>

      {/* Liste */}
      <div style={{ padding: '0 0 40px' }}>
        {filtered.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #F5F0E8' }}>

            {/* Avatar */}
            <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {m.avatar
                ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 700 }}>{(m.name || m.email)[0]?.toUpperCase()}</span>}
            </div>

            {/* Infos */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name || <span style={{ color: '#9A8A7A' }}>Sans nom</span>}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
              <p style={{ margin: 0, fontSize: 10, color: '#B0A898' }}>
                Inscrit {fmt(m.created_at)}
                {m.last_sign_in && ` · Actif ${fmt(m.last_sign_in)}`}
              </p>
            </div>

            {/* Producteur + plan */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              {m.producer ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {m.producer.photo && <img src={m.producer.photo} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} />}
                    <span style={{ fontSize: 11, color: '#2D5A3D', fontWeight: 700, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🌿 {m.producer.nom}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleMax(m.producer!.id, m.producer!.is_max)}
                    disabled={toggling === m.producer.id}
                    style={{
                      padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 800,
                      backgroundColor: m.producer.is_max ? '#E8622A' : '#E8F2EB',
                      color: m.producer.is_max ? '#fff' : '#2D5A3D',
                      opacity: toggling === m.producer.id ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {m.producer.is_max ? '★ MAX' : '○ Basic'}
                  </button>
                </>
              ) : (
                <Link
                  href="/admin/producteurs"
                  style={{ fontSize: 10, color: '#9A8A7A', textDecoration: 'none', border: '1px dashed #C8BDB0', padding: '3px 8px', borderRadius: 999 }}
                >
                  + Créer profil
                </Link>
              )}
            </div>

          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9A8A7A', fontSize: 13 }}>
            Aucun membre trouvé.
          </div>
        )}
      </div>
    </div>
  )
}
