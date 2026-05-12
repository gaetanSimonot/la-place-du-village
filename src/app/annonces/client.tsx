'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AnnonceCard from '@/components/AnnonceCard'
import AnnonceFilters, { type TriOption } from '@/components/AnnonceFilters'
import type { Annonce, AnnonceType, AnnonceCategorie } from '@/lib/annonces'

export default function AnnoncesPageClient() {
  const [annonces, setAnnonces] = useState<Annonce[]>([])
  const [loading, setLoading]   = useState(true)
  const [type, setType]         = useState<AnnonceType | null>(null)
  const [categorie, setCategorie] = useState<AnnonceCategorie | null>(null)
  const [tri, setTri]           = useState<TriOption>('date_desc')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    ;(async () => {
      let query = supabase
        .from('annonces')
        .select('*')
        .in('statut', ['active', 'don_final'])
        .order('sponsored', { ascending: false })

      if (type)      query = query.eq('type', type)
      if (categorie) query = query.eq('categorie', categorie)

      switch (tri) {
        case 'prix_asc':  query = query.order('prix_actuel', { ascending: true,  nullsFirst: false }); break
        case 'prix_desc': query = query.order('prix_actuel', { ascending: false, nullsFirst: false }); break
        default:          query = query.order('created_at',  { ascending: false })
      }

      query = query.limit(100)
      const { data } = await query
      if (mounted) {
        setAnnonces((data as Annonce[]) ?? [])
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [type, categorie, tri])

  const sponsored = useMemo(() => annonces.filter(a => a.sponsored), [annonces])
  const standard  = useMemo(() => annonces.filter(a => !a.sponsored), [annonces])

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF6', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: '#FDFAF6',
        borderBottom: '1px solid #E5DDD2',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 6px' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#1C1917' }}>Annonces</h1>
          <Link
            href="/annonces/nouvelle"
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              backgroundColor: '#2D5A3D',
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            + Publier
          </Link>
        </div>

        <AnnonceFilters
          type={type}
          categorie={categorie}
          tri={tri}
          onTypeChange={setType}
          onCategorieChange={setCategorie}
          onTriChange={setTri}
        />
      </div>

      {/* Liste */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#8A7A6A', padding: 40 }}>Chargement…</p>
        ) : annonces.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8A7A6A', padding: 40 }}>Aucune annonce ne correspond.</p>
        ) : (
          <>
            {sponsored.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sponsored.map(a => <AnnonceCard key={a.id} annonce={a} />)}
              </div>
            )}
            {standard.map(a => <AnnonceCard key={a.id} annonce={a} />)}
          </>
        )}
      </div>
    </div>
  )
}
