'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'

type Onglet = 'a_traiter' | 'publie' | 'rejete'

export default function AdminPage() {
  const [onglet, setOnglet] = useState<Onglet>('a_traiter')
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('evenements')
      .select('*, lieux(*)')
      .order('created_at', { ascending: false })
    setEvenements((data as Evenement[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const setStatut = async (id: string, statut: string) => {
    setActionId(id)
    await fetch(`/api/admin/evenements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    })
    await fetchAll()
    setActionId(null)
  }

  const supprimer = async (id: string) => {
    if (!confirm('Supprimer cet événement ?')) return
    setActionId(id)
    await fetch(`/api/admin/evenements/${id}`, { method: 'DELETE' })
    await fetchAll()
    setActionId(null)
  }

  // Filtrage par onglet
  const filtered = evenements.filter(e => {
    if (onglet === 'a_traiter') return e.statut === 'en_attente' || (e.statut === 'publie' && isApproxLocation(e.lieux))
    return e.statut === onglet
  })

  // Tri : approx en premier dans "à traiter"
  const sorted = onglet === 'a_traiter'
    ? [...filtered].sort((a, b) => {
        const aApprox = isApproxLocation(a.lieux) ? 0 : 1
        const bApprox = isApproxLocation(b.lieux) ? 0 : 1
        return aApprox - bApprox
      })
    : filtered

  const counts = {
    a_traiter: evenements.filter(e => e.statut === 'en_attente' || (e.statut === 'publie' && isApproxLocation(e.lieux))).length,
    publie: evenements.filter(e => e.statut === 'publie').length,
    rejete: evenements.filter(e => e.statut === 'rejete').length,
  }

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* Header */}
      <div className="bg-[#2C1810] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] text-xl font-bold">←</Link>
        <h1 className="font-bold text-lg flex-1">Back-office</h1>
        <button onClick={fetchAll} className="text-xs text-gray-400 underline">Actualiser</button>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-[#E8E0D5] bg-white">
        {([
          { key: 'a_traiter', label: 'À traiter', color: 'bg-orange-500' },
          { key: 'publie',    label: 'Publiés',   color: 'bg-green-500' },
          { key: 'rejete',    label: 'Rejetés',   color: 'bg-gray-400' },
        ] as { key: Onglet; label: string; color: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setOnglet(tab.key)}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              onglet === tab.key ? 'text-[#C4622D] border-b-2 border-[#C4622D]' : 'text-gray-400'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`${tab.color} text-white text-xs rounded-full w-5 h-5 flex items-center justify-center`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Aucun événement</p>
        ) : sorted.map(evt => {
          const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
          const approx = isApproxLocation(evt.lieux)
          const isLoading = actionId === evt.id

          return (
            <div
              key={evt.id}
              className={`bg-white rounded-2xl p-4 border-2 ${
                approx ? 'border-orange-200' : 'border-transparent'
              } shadow-sm`}
            >
              {approx && (
                <div className="flex items-center gap-1.5 text-xs text-orange-500 font-semibold mb-2 bg-orange-50 rounded-lg px-2 py-1">
                  📍 Localisation approximative — à corriger
                </div>
              )}

              {/* Titre + badge */}
              <div className="flex items-start gap-2 mb-1">
                <span
                  className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full text-white mt-0.5"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2C1810] leading-tight">{evt.titre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {evt.date_debut ? formatDate(evt.date_debut) : 'Sans date'}
                    {evt.lieux ? ` · ${evt.lieux.nom}` : ''}
                    {evt.lieux?.commune ? `, ${evt.lieux.commune}` : ''}
                  </p>
                </div>
                <StatutBadge statut={evt.statut} />
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {evt.statut !== 'publie' && (
                  <button
                    onClick={() => setStatut(evt.id, 'publie')}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    ✓ Publier
                  </button>
                )}
                {evt.statut === 'publie' && (
                  <button
                    onClick={() => setStatut(evt.id, 'en_attente')}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-orange-400 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    ⏸ Dépublier
                  </button>
                )}
                {evt.statut !== 'rejete' && (
                  <button
                    onClick={() => setStatut(evt.id, 'rejete')}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-gray-300 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    ✗ Rejeter
                  </button>
                )}
                <Link
                  href={`/admin/evenement/${evt.id}`}
                  className="flex-1 py-1.5 bg-[#FBF7F0] text-[#C4622D] text-xs font-bold rounded-lg text-center border border-[#C4622D]"
                >
                  ✏️ Éditer
                </Link>
                <button
                  onClick={() => supprimer(evt.id)}
                  disabled={isLoading}
                  className="py-1.5 px-3 bg-red-50 text-red-400 text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  🗑️
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatutBadge({ statut }: { statut: string }) {
  const styles: Record<string, string> = {
    publie:     'bg-green-100 text-green-700',
    en_attente: 'bg-orange-100 text-orange-600',
    rejete:     'bg-gray-100 text-gray-500',
  }
  const labels: Record<string, string> = {
    publie: 'Publié', en_attente: 'En attente', rejete: 'Rejeté',
  }
  return (
    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${styles[statut] ?? ''}`}>
      {labels[statut] ?? statut}
    </span>
  )
}
