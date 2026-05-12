'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AnnonceCard from '@/components/AnnonceCard'
import AnnonceFilters, { type TriOption } from '@/components/AnnonceFilters'
import BottomNavBar from '@/components/BottomNavBar'
import type { Annonce, AnnonceType, AnnonceCategorie } from '@/lib/annonces'

export default function AnnoncesPageClient() {
  const router = useRouter()
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
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E5DDD2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px' }}>
          <button onClick={() => router.push('/')} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 800, color: '#2C1810' }}>Annonces</h1>
          <Link
            href="/annonces/messages"
            style={{
              padding: '6px 12px', borderRadius: 10,
              border: '1.5px solid #2D5A3D',
              color: '#2D5A3D', fontSize: 12, fontWeight: 700,
              textDecoration: 'none', flexShrink: 0,
            }}
          >💬 Mes msg</Link>
          <Link
            href="/annonces/nouvelle"
            style={{
              padding: '8px 14px', borderRadius: 999,
              backgroundColor: '#2D5A3D',
              color: '#fff', fontSize: 12, fontWeight: 800,
              textDecoration: 'none', flexShrink: 0,
            }}
          >+ Publier</Link>
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

      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : annonces.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>📭</p>
            <p style={{ color: '#8A7A6A', margin: 0 }}>Aucune annonce ne correspond.</p>
          </div>
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

      <BottomNavBar />
    </div>
  )
}
