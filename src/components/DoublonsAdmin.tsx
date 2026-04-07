'use client'
import { useState } from 'react'
import { formatDate } from '@/lib/filters'

interface Paire {
  id_a: string; titre_a: string; date_a: string | null; commune_a: string | null; desc_a: string | null
  id_b: string; titre_b: string; date_b: string | null; commune_b: string | null; desc_b: string | null
  raison: string
}

export default function DoublonsAdmin() {
  const [paires, setPaires]       = useState<Paire[]>([])
  const [analysing, setAnalysing] = useState(false)
  const [analysed, setAnalysed]   = useState(false)
  const [totalAnalyses, setTotalAnalyses] = useState(0)
  const [resolving, setResolving] = useState<string | null>(null) // id_a de la paire en cours
  const [stats, setStats]         = useState({ fusionnes: 0, archives: 0, ignores: 0 })

  const analyser = async () => {
    setAnalysing(true)
    setPaires([])
    setAnalysed(false)
    try {
      const res  = await fetch('/api/admin/doublons/analyser', { method: 'POST' })
      const data = await res.json()
      setPaires(data.paires ?? [])
      setTotalAnalyses(data.total_analyses ?? 0)
      setAnalysed(true)
    } finally {
      setAnalysing(false)
    }
  }

  const resoudre = async (action: 'fusionner' | 'archiver' | 'ignorer', paire: Paire) => {
    setResolving(paire.id_a)
    try {
      const res = await fetch('/api/admin/doublons/resoudre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id_a: paire.id_a, id_b: paire.id_b }),
      })
      if (!res.ok) { alert('Erreur lors de la résolution'); return }
      setPaires(prev => prev.filter(p => p.id_a !== paire.id_a))
      setStats(s => ({
        ...s,
        fusionnes: action === 'fusionner' ? s.fusionnes + 1 : s.fusionnes,
        archives:  action === 'archiver'  ? s.archives  + 1 : s.archives,
        ignores:   action === 'ignorer'   ? s.ignores   + 1 : s.ignores,
      }))
    } finally {
      setResolving(null)
    }
  }

  const nbResolus = stats.fusionnes + stats.archives + stats.ignores

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      {(analysed || nbResolus > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Détectés',  value: paires.length + nbResolus, color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: 'Fusionnés', value: stats.fusionnes,           color: 'bg-blue-50 text-blue-700 border-blue-200'   },
            { label: 'Ignorés',   value: stats.ignores,             color: 'bg-gray-50 text-gray-600 border-gray-200'   },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-3 py-2 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bouton analyser */}
      <button
        onClick={analyser}
        disabled={analysing}
        className="w-full py-3 bg-[#2C1810] text-white font-bold rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {analysing ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Analyse en cours…
          </>
        ) : (
          <>🔍 Analyser toute la base</>
        )}
      </button>

      {analysing && (
        <p className="text-xs text-center text-gray-400">
          Claude passe en revue les événements publiés par batch de 30…
        </p>
      )}

      {/* Résultats */}
      {analysed && !analysing && (
        <p className="text-xs text-center text-gray-500">
          {totalAnalyses} événements analysés ·{' '}
          {paires.length === 0
            ? 'Aucun doublon suspect trouvé ✓'
            : `${paires.length} paire${paires.length > 1 ? 's' : ''} suspecte${paires.length > 1 ? 's' : ''} détectée${paires.length > 1 ? 's' : ''}`}
        </p>
      )}

      {/* Paires */}
      {paires.map(paire => {
        const isResolving = resolving === paire.id_a
        return (
          <div key={paire.id_a} className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">
            {/* Raison */}
            <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
              <p className="text-xs text-amber-700 font-semibold">⚠️ {paire.raison}</p>
            </div>

            {/* Deux fiches côte à côte */}
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              {[
                { id: paire.id_a, titre: paire.titre_a, date: paire.date_a, commune: paire.commune_a, desc: paire.desc_a, label: 'A' },
                { id: paire.id_b, titre: paire.titre_b, date: paire.date_b, commune: paire.commune_b, desc: paire.desc_b, label: 'B' },
              ].map(evt => (
                <div key={evt.id} className="p-3 space-y-1">
                  <span className="inline-block text-xs font-bold text-white bg-gray-400 rounded-full px-1.5 py-0.5">{evt.label}</span>
                  <p className="text-xs font-bold text-[#2C1810] leading-tight">{evt.titre}</p>
                  <p className="text-xs text-gray-400">
                    {evt.date ? formatDate(evt.date) : 'Sans date'}
                    {evt.commune ? ` · ${evt.commune}` : ''}
                  </p>
                  {evt.desc && <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{evt.desc}</p>}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-3 border-t border-gray-100">
              <button
                onClick={() => resoudre('fusionner', paire)}
                disabled={isResolving}
                className="flex-1 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {isResolving ? '…' : '🔀 Fusionner'}
              </button>
              <button
                onClick={() => resoudre('archiver', paire)}
                disabled={isResolving}
                className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {isResolving ? '…' : '📦 Archiver B'}
              </button>
              <button
                onClick={() => resoudre('ignorer', paire)}
                disabled={isResolving}
                className="flex-1 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {isResolving ? '…' : '✓ Pas un doublon'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
