'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Redeemer { user_id: string; name: string; avatar: string | null; used_at: string }
interface PromoStat {
  id: string; title: string; image_url: string | null
  active: boolean; valid_until: string | null; created_at: string
  count: number; redeemers: Redeemer[]
}

function relDate(iso: string): string {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diff <= 0) return "aujourd'hui"
  if (diff === 1) return 'hier'
  if (diff < 7) return `il y a ${diff} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function isExpired(p: PromoStat): boolean {
  if (!p.active) return true
  return !!p.valid_until && new Date(p.valid_until) < new Date()
}

/**
 * Espace « Promotions » du pro : liste ses promos (actives/passées) avec le
 * nombre de personnes qui en ont profité + qui (pseudo cliquable → leur mur).
 * S'auto-charge ; ne rend rien si l'utilisateur n'a aucune promo.
 */
export default function PromoStatsPanel() {
  const [promos, setPromos] = useState<PromoStat[] | null>(null)
  const [total, setTotal]   = useState(0)
  const [open, setOpen]     = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const r = await fetch('/api/profile/mes-promotions', { headers: tk ? { Authorization: `Bearer ${tk}` } : {} }).catch(() => null)
      if (r && r.ok) { const d = await r.json(); setPromos(d.promotions ?? []); setTotal(d.totalUses ?? 0) }
      else setPromos([])
    })()
  }, [])

  if (promos === null) {
    return <div className="flex justify-center px-4 py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>
  }
  if (promos.length === 0) return null

  return (
    <div className="px-4 pt-3.5">
      {/* En-tête total */}
      <div className="mb-3 flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]" style={{ borderColor: '#F0EAE0' }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E5] text-[20px]">🎁</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[18px] font-extrabold leading-none text-texte">{total}</p>
          <p className="m-0 mt-0.5 text-[11.5px] text-texte-doux">
            {total > 1 ? 'personnes ont profité de tes promotions' : total === 1 ? 'personne a profité de tes promotions' : 'profit de tes promotions pour l’instant'}
          </p>
        </div>
      </div>

      {/* Cartes par promo */}
      <div className="flex flex-col gap-2">
        {promos.map(p => {
          const expired = isExpired(p)
          const isOpen = open === p.id
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]" style={{ borderColor: '#F0EAE0' }}>
              <button
                onClick={() => setOpen(o => o === p.id ? null : p.id)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFF0E5] text-accent">
                  {p.image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                    : <span className="text-[18px]">🎁</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13.5px] font-bold text-texte">{p.title}</p>
                  <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.04em]"
                    style={expired ? { background: '#F0EAE0', color: '#9A8A7A' } : { background: '#E8F2EB', color: '#2D5A3D' }}>
                    {expired ? 'Terminée' : 'Active'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full bg-[#FFF0E5] px-2.5 py-1 text-[12px] font-extrabold text-accent">
                    👥 {p.count}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-texte-doux" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-3.5 py-1" style={{ borderColor: '#F5EFE6' }}>
                  {p.redeemers.length === 0 ? (
                    <p className="m-0 py-3 text-center text-[12px] text-texte-doux">Personne n’en a encore profité.</p>
                  ) : (
                    p.redeemers.map((r, i) => (
                      <Link
                        key={`${r.user_id}-${i}`}
                        href={`/profil/${r.user_id}`}
                        className={`flex items-center gap-2.5 py-2.5 ${i < p.redeemers.length - 1 ? 'border-b' : ''}`}
                        style={{ borderColor: '#F5EFE6' }}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cremeDeep text-[12px] font-bold text-texte-doux">
                          {r.avatar
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={r.avatar} alt="" className="h-full w-full object-cover" />
                            : (r.name[0] ?? '?').toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-texte">{r.name}</span>
                        <span className="shrink-0 text-[11px] text-texte-doux">{relDate(r.used_at)}</span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
