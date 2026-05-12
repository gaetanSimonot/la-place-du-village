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
  const hasEnchere = annonces.some(a => a.type === 'enchere_inversee')

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E5DDD2' }}>
        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/')} style={{
              width: 34, height: 34, borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#2D5A3D', fontSize: 18, flexShrink: 0,
              boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
            }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#2C1810', letterSpacing: '-0.02em' }}>Annonces</h1>
              <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A' }}>Achetez, vendez, échangez près de chez vous</p>
            </div>
            <Link
              href="/annonces/messages"
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.8)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#2D5A3D', fontSize: 16,
                textDecoration: 'none', flexShrink: 0,
                boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
              }}
              title="Mes messages"
            >💬</Link>
          </div>
          <Link
            href="/annonces/nouvelle"
            style={{
              display: 'block', marginTop: 10,
              padding: '10px 16px', borderRadius: 12,
              backgroundColor: '#2D5A3D', color: '#fff',
              fontSize: 13, fontWeight: 800,
              textDecoration: 'none', textAlign: 'center',
              boxShadow: '0 4px 14px rgba(45,90,61,0.25)',
            }}
          >+ Publier une annonce</Link>
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
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            {sponsored.map(a => <AnnonceCard key={a.id} annonce={a} />)}
            {standard.map(a => <AnnonceCard key={a.id} annonce={a} />)}

            {/* Card explicative enchères à l'envers */}
            {hasEnchere && <EnchereExplainCard />}
          </>
        )}
      </div>

      <BottomNavBar />
    </div>
  )
}

function EnchereExplainCard() {
  return (
    <div style={{
      marginTop: 6,
      padding: '14px 16px',
      borderRadius: 18,
      background: 'linear-gradient(135deg, #E8F2EB 0%, #F2EBE0 100%)',
      border: '1.5px solid #C5DCC9',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20l4-6 4 3 7-9"/>
          <path d="M17 8h4v4"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#2D5A3D' }}>Enchères à l&apos;envers</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#5A6E60', lineHeight: 1.4 }}>
          Le prix baisse chaque jour. Plus tu attends, moins c&apos;est cher — mais quelqu&apos;un peut t&apos;avoir devancé.
        </p>
      </div>
    </div>
  )
}
