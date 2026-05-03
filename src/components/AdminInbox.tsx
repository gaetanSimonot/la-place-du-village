'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import EventEditDrawer from '@/components/EventEditDrawer'

interface MessageEntrant {
  id: string
  source: string
  groupe: string | null
  auteur: string | null
  contenu: string | null
  image_url: string | null
  statut: string
  extraction: Record<string, unknown>[] | null
  raison: string | null
  evenement_id: string | null
  created_at: string
}

const STATUT_TABS = [
  { key: 'tous',          label: 'Tous' },
  { key: 'non_publiable', label: 'Non publiable' },
  { key: 'en_attente',    label: 'En attente' },
  { key: 'publie',        label: 'Publié' },
  { key: 'doublon',       label: 'Doublon' },
  { key: 'hors_zone',     label: 'Hors zone' },
  { key: 'ignore',        label: 'Ignoré' },
]

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: 'bg-green-100 text-green-700',
  signal:   'bg-blue-100 text-blue-700',
  share:    'bg-purple-100 text-purple-700',
  scrape:   'bg-gray-100 text-gray-600',
}

const STATUT_COLORS: Record<string, string> = {
  a_traiter:     'bg-yellow-100 text-yellow-700',
  publie:        'bg-green-100 text-green-700',
  en_attente:    'bg-orange-100 text-orange-600',
  non_publiable: 'bg-red-100 text-red-600',
  doublon:       'bg-gray-100 text-gray-500',
  hors_zone:     'bg-blue-100 text-blue-600',
  ignore:        'bg-gray-100 text-gray-400',
}

const STATUT_LABELS: Record<string, string> = {
  a_traiter:     'À traiter',
  publie:        'Publié',
  en_attente:    'En attente',
  non_publiable: 'Non publiable',
  doublon:       'Doublon',
  hors_zone:     'Hors zone',
  ignore:        'Ignoré',
}

interface Props {
  onCountChange?: (count: number) => void
}

export default function AdminInbox({ onCountChange }: Props) {
  const [messages, setMessages] = useState<MessageEntrant[]>([])
  const [total, setTotal]       = useState(0)
  const [statut, setStatut]     = useState('tous')
  const [loading, setLoading]   = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [counts, setCounts]     = useState<Record<string, number>>({})
  const [editId, setEditId]     = useState<string | null>(null)

  const fetchMessages = useCallback(async (s: string) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (s !== 'tous') params.set('statut', s)
    const res = await fetch(`/api/admin/inbox?${params}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data.messages)
      setTotal(data.total)
    }
    setLoading(false)
  }, [])

  const fetchCounts = useCallback(async () => {
    const statuts = ['non_publiable', 'en_attente', 'doublon', 'hors_zone', 'a_traiter']
    const results = await Promise.all(
      statuts.map(s =>
        fetch(`/api/admin/inbox?statut=${s}&limit=1`)
          .then(r => r.ok ? r.json() : { total: 0 })
          .then((d: { total?: number }) => ({ s, n: d.total ?? 0 }))
      )
    )
    const c: Record<string, number> = {}
    for (const { s, n } of results) c[s] = n
    setCounts(c)
    const pending = (c.non_publiable ?? 0) + (c.en_attente ?? 0) + (c.a_traiter ?? 0)
    onCountChange?.(pending)
  }, [onCountChange])

  useEffect(() => {
    fetchMessages('tous')
    fetchCounts()
  }, [fetchMessages, fetchCounts])

  const changeStatut = (s: string) => {
    setStatut(s)
    fetchMessages(s)
  }

  const refresh = useCallback(async () => {
    await fetchMessages(statut)
    await fetchCounts()
  }, [fetchMessages, fetchCounts, statut])

  const ignorer = async (id: string) => {
    setActionId(id)
    await fetch(`/api/admin/inbox/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'ignore' }),
    })
    await refresh()
    setActionId(null)
  }

  const retraiter = async (id: string) => {
    setActionId(id)
    await fetch(`/api/admin/inbox/${id}/process`, { method: 'POST' })
    await refresh()
    setActionId(null)
  }

  const supprimer = async (id: string) => {
    if (!confirm('Supprimer ce message ?')) return
    setActionId(id)
    await fetch(`/api/admin/inbox/${id}`, { method: 'DELETE' })
    setMessages(prev => prev.filter(m => m.id !== id))
    setTotal(prev => prev - 1)
    setActionId(null)
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalPending = (counts.non_publiable ?? 0) + (counts.en_attente ?? 0) + (counts.a_traiter ?? 0)

  return (
    <div>
      {/* Sous-onglets statut */}
      <div className="flex overflow-x-auto border-b border-[#E8E0D5] bg-white">
        {STATUT_TABS.map(tab => {
          const count = tab.key !== 'tous' ? (counts[tab.key] ?? 0) : undefined
          return (
            <button
              key={tab.key}
              onClick={() => changeStatut(tab.key)}
              className={`shrink-0 px-3 py-2.5 text-xs font-semibold flex items-center gap-1 transition-colors ${
                statut === tab.key ? 'text-[#C4622D] border-b-2 border-[#C4622D]' : 'text-gray-400'
              }`}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {totalPending > 0 && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-amber-700 font-medium">
            {totalPending} message{totalPending > 1 ? 's' : ''} à examiner
          </p>
          <button onClick={refresh} className="text-xs text-amber-600 underline">Actualiser</button>
        </div>
      )}

      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Aucun message</p>
        ) : messages.map(msg => {
          const isLoading  = actionId === msg.id
          const isExpanded = expanded.has(msg.id)
          const extraction = Array.isArray(msg.extraction) ? msg.extraction : null

          return (
            <div key={msg.id} className="bg-white rounded-2xl p-4 border border-[#E8E0D5] shadow-sm">
              {/* Ligne meta */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[msg.source] ?? 'bg-gray-100 text-gray-500'}`}>
                  {msg.source}
                </span>
                {msg.groupe && (
                  <span className="text-xs text-gray-500 truncate max-w-[130px]">{msg.groupe}</span>
                )}
                {msg.auteur && (
                  <span className="text-xs text-gray-400">· {msg.auteur}</span>
                )}
                <span className="ml-auto text-xs text-gray-400 shrink-0">
                  {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Statut + raison */}
              <div className="flex items-start gap-2 mb-2 flex-wrap">
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUT_COLORS[msg.statut] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUT_LABELS[msg.statut] ?? msg.statut}
                </span>
                {msg.raison && (
                  <span className="text-xs text-gray-500 italic leading-relaxed">{msg.raison}</span>
                )}
              </div>

              {/* Image */}
              {msg.image_url && (
                <div className="relative w-full h-24 rounded-xl overflow-hidden mb-2" style={{ backgroundColor: '#f0ece6' }}>
                  <Image src={msg.image_url} alt="" fill sizes="400px" className="object-cover" />
                </div>
              )}

              {/* Contenu brut */}
              {msg.contenu && (
                <p className="text-sm text-[#2C1810] leading-relaxed mb-2 line-clamp-3">{msg.contenu}</p>
              )}

              {/* Extraction Claude dépliable */}
              {extraction && extraction.length > 0 && (
                <div className="mb-1">
                  <button
                    onClick={() => toggleExpand(msg.id)}
                    className="text-xs text-[#C4622D] font-semibold flex items-center gap-1 mb-1"
                  >
                    Claude a extrait {extraction.length} événement{extraction.length > 1 ? 's' : ''}
                    <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-2">
                      {extraction.map((evt, i) => (
                        <div key={i} className="bg-[#FBF7F0] rounded-xl p-3 text-xs space-y-0.5">
                          {evt.titre != null ? <p className="font-bold text-[#2C1810]">{String(evt.titre)}</p> : null}
                          {(evt.date_debut != null || evt.heure != null) ? (
                            <p className="text-gray-500">
                              {evt.date_debut != null ? String(evt.date_debut) : ''}
                              {evt.heure != null ? ` à ${String(evt.heure)}` : ''}
                            </p>
                          ) : null}
                          {evt.lieu_nom != null ? (
                            <p className="text-gray-500">
                              📍 {String(evt.lieu_nom)}{evt.commune != null ? `, ${String(evt.commune)}` : ''}
                            </p>
                          ) : null}
                          {evt.description != null ? (
                            <p className="text-gray-600 line-clamp-2">{String(evt.description)}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {msg.statut !== 'ignore' && (
                  <button
                    onClick={() => retraiter(msg.id)}
                    disabled={isLoading}
                    className="flex-1 py-1.5 bg-[#C4622D] text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    {isLoading ? '…' : '↻ Réessayer'}
                  </button>
                )}
                {msg.evenement_id && (
                  <button
                    onClick={() => setEditId(msg.evenement_id!)}

                    className="flex-1 py-1.5 bg-[#FBF7F0] text-[#C4622D] text-xs font-bold rounded-lg text-center border border-[#C4622D]"
                  >
                    Voir événement
                  </button>
                )}
                {msg.statut !== 'ignore' && (
                  <button
                    onClick={() => ignorer(msg.id)}
                    disabled={isLoading}
                    className="py-1.5 px-3 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    Ignorer
                  </button>
                )}
                <button
                  onClick={() => supprimer(msg.id)}
                  disabled={isLoading}
                  className="py-1.5 px-3 bg-red-50 text-red-400 text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  🗑️
                </button>
              </div>
            </div>
          )
        })}

        {total > messages.length && (
          <p className="text-center text-xs text-gray-400 py-2">
            {messages.length} / {total} messages affichés
          </p>
        )}
      </div>

      {editId && (
        <EventEditDrawer
          evenementId={editId}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); refresh() }}
        />
      )}
    </div>
  )
}
