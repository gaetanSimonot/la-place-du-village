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
    <div className="min-h-[100dvh] bg-creme pb-20 font-inter text-texte">
      <style>{`.pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; } .pdv-hscroll::-webkit-scrollbar { display: none; }`}</style>

      {/* Top bar V3 — back + Annonces + bouton messages avec badge */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
        <button
          onClick={() => router.push('/')}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-px">
          <div className="font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Annonces
          </div>
          <div className="flex items-center gap-[3px] text-[11px] font-semibold text-texte-doux">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
              <circle cx="12" cy="10" r="2.5"/>
            </svg>
            <span>Près de chez vous</span>
          </div>
        </div>
        <Link
          href="/annonces/messages"
          aria-label="Mes messages"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte no-underline shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </Link>
      </div>

      {/* Publier intro */}
      <div className="px-4 pt-[18px]">
        <div className="flex items-center gap-3 rounded-2xl border border-bord bg-white px-3 py-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-[1.2] text-texte">Publier une annonce</div>
            <div className="mt-0.5 text-[11px] text-texte-doux">Vente, don, troc ou enchère inversée</div>
          </div>
          <Link
            href="/annonces/nouvelle"
            className="shrink-0 whitespace-nowrap rounded-full bg-primary px-3.5 py-2 text-[12px] font-bold text-white no-underline"
          >
            Créer
          </Link>
        </div>
      </div>

      {/* Filtres V3 (TypePills + filter/sort) */}
      <AnnonceFilters
        type={type}
        categorie={categorie}
        tri={tri}
        onTypeChange={setType}
        onCategorieChange={setCategorie}
        onTriChange={setTri}
      />

      {/* Grid 2-col */}
      <div className="px-4 pt-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" />
          </div>
        ) : annonces.length === 0 ? (
          <div className="py-14 text-center">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C8B8A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="9" x2="15" y2="9"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <p className="m-0 text-[14px] font-bold text-texte-doux">Aucune annonce ne correspond.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {sponsored.map(a => <AnnonceCard key={a.id} annonce={a} />)}
              {standard.map(a => <AnnonceCard key={a.id} annonce={a} />)}
            </div>
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
    <div className="mt-4">
      <div
        className="flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
        style={{ backgroundColor: '#FFF0E5', borderColor: '#F5C8A8' }}
      >
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-white text-accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/>
            <polyline points="16 17 22 17 22 11"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold leading-[1.2] text-accent">Enchères à l&apos;envers</div>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-texte-doux">
            Le prix baisse chaque jour. Plus tu attends, moins c&apos;est cher — mais quelqu&apos;un peut t&apos;avoir devancé.
          </p>
        </div>
      </div>
    </div>
  )
}
