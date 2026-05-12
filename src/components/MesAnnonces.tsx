'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Annonce, AnnonceStatut } from '@/lib/annonces'
import { getPrixAffiche, CATEGORIES_ICONS } from '@/lib/annonces'

const STATUT_LABELS: Record<AnnonceStatut, string> = {
  active:    'En ligne',
  vendu:     'Vendu',
  expiree:   'Expirée',
  don_final: 'Don final',
}

const STATUT_COLORS: Record<AnnonceStatut, string> = {
  active:    '#2D5A3D',
  vendu:     '#3A5BC7',
  expiree:   '#8A7A6A',
  don_final: '#E8622A',
}

type TabKey = 'active' | 'historique'

/**
 * Onglet "Mes annonces" — embedded dans l'espace personnel.
 * Affiche l'historique complet du user (tous statuts).
 */
export default function MesAnnonces() {
  const { user } = useAuth()
  const [annonces, setAnnonces] = useState<Annonce[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<TabKey>('active')

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setLoading(false); return }
      const res = await fetch('/api/annonces/mes-annonces', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (mounted) {
        setAnnonces(data.annonces ?? [])
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [user])

  if (!user) return null

  const actives     = annonces.filter(a => a.statut === 'active')
  const historiques = annonces.filter(a => a.statut !== 'active')
  const visible     = tab === 'active' ? actives : historiques

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1C1917' }}>Mes annonces</h2>
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
          + Nouvelle
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E5DDD2' }}>
        <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
          En ligne ({actives.length})
        </TabButton>
        <TabButton active={tab === 'historique'} onClick={() => setTab('historique')}>
          Historique ({historiques.length})
        </TabButton>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#8A7A6A' }}>Chargement…</p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, color: '#8A7A6A', padding: '20px 0', textAlign: 'center' }}>
          {tab === 'active' ? 'Tu n\'as aucune annonce en ligne.' : 'Aucun historique.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(a => (
            <Link
              key={a.id}
              href={`/annonces/${a.id}`}
              style={{
                display: 'flex',
                gap: 10,
                padding: 10,
                backgroundColor: '#fff',
                borderRadius: 12,
                textDecoration: 'none',
                color: 'inherit',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{
                width: 56, height: 56, flexShrink: 0,
                borderRadius: 8, overflow: 'hidden',
                backgroundColor: '#F0EBE3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>
                {a.photos[0]
                  ? <img src={a.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : CATEGORIES_ICONS[a.categorie]
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: STATUT_COLORS[a.statut],
                    backgroundColor: '#F5F1EB',
                    padding: '1px 8px',
                    borderRadius: 999,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {STATUT_LABELS[a.statut]}
                  </span>
                  {a.sponsored && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: '#E8622A',
                      backgroundColor: '#FFF0EB', padding: '1px 8px', borderRadius: 999,
                    }}>✦ En vedette</span>
                  )}
                </div>
                <p style={{
                  margin: 0, fontSize: 14, fontWeight: 700, color: '#1C1917',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.titre}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8A7A6A', fontWeight: 600 }}>
                  {getPrixAffiche(a)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        padding: '10px 4px',
        fontSize: 13,
        fontWeight: active ? 800 : 600,
        color: active ? '#2D5A3D' : '#8A7A6A',
        borderBottom: active ? '2px solid #2D5A3D' : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}
