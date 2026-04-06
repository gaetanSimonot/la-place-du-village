'use client'
import { useState } from 'react'
import { Filtres, Categorie, FiltreQuand } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'

const QUAND_OPTIONS: { value: FiltreQuand; label: string }[] = [
  { value: 'toujours',      label: 'Toujours' },
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'ce_week_end',   label: 'Ce week-end' },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_mois',       label: 'Ce mois' },
]

interface Props {
  filtres: Filtres
  onChange: (f: Filtres) => void
}

export default function FilterBar({ filtres, onChange }: Props) {
  const [openModal, setOpenModal] = useState<'categorie' | 'quand' | null>(null)

  const toggleCategorie = (cat: Categorie) => {
    const cats = filtres.categories.includes(cat)
      ? filtres.categories.filter(c => c !== cat)
      : [...filtres.categories, cat]
    onChange({ ...filtres, categories: cats })
  }

  const setQuand = (quand: FiltreQuand) => {
    onChange({ ...filtres, quand })
    setOpenModal(null)
  }

  const hasCategFilter = filtres.categories.length > 0
  const hasQuandFilter = filtres.quand !== 'toujours'
  const quandLabel = QUAND_OPTIONS.find(o => o.value === filtres.quand)?.label

  return (
    <>
      <header className="flex gap-3 px-4 py-3 bg-white border-b border-[#E8E0D5] z-20 relative">
        <button
          onClick={() => setOpenModal(openModal === 'categorie' ? null : 'categorie')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all ${
            hasCategFilter
              ? 'bg-[#C4622D] text-white border-[#C4622D]'
              : 'bg-[#FBF7F0] text-[#2C1810] border-[#E8E0D5]'
          }`}
        >
          {hasCategFilter ? `Que faire (${filtres.categories.length})` : 'Que faire ▾'}
        </button>
        <button
          onClick={() => setOpenModal(openModal === 'quand' ? null : 'quand')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all ${
            hasQuandFilter
              ? 'bg-[#C4622D] text-white border-[#C4622D]'
              : 'bg-[#FBF7F0] text-[#2C1810] border-[#E8E0D5]'
          }`}
        >
          {hasQuandFilter ? quandLabel : 'Quand ▾'}
        </button>
      </header>

      {openModal && (
        <div className="fixed inset-0 z-30" onClick={() => setOpenModal(null)}>
          <div
            className="absolute top-[72px] left-0 right-0 bg-white shadow-xl border-b border-[#E8E0D5] p-4"
            onClick={e => e.stopPropagation()}
          >
            {openModal === 'categorie' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(CATEGORIES) as [Categorie, { label: string; emoji: string; color: string }][]).map(([key, cat]) => {
                    const active = filtres.categories.includes(key)
                    return (
                      <button
                        key={key}
                        onClick={() => toggleCategorie(key)}
                        className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          active ? 'text-white' : 'border-[#E8E0D5] text-[#2C1810] bg-[#FBF7F0]'
                        }`}
                        style={active ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
                      >
                        <span>{cat.emoji}</span>
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
                {hasCategFilter && (
                  <button
                    onClick={() => { onChange({ ...filtres, categories: [] }); setOpenModal(null) }}
                    className="mt-3 w-full py-2 text-sm text-gray-400 underline"
                  >
                    Effacer les filtres
                  </button>
                )}
              </>
            )}
            {openModal === 'quand' && (
              <div className="flex flex-col gap-2">
                {QUAND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setQuand(opt.value)}
                    className={`py-3 px-4 rounded-xl text-sm font-medium text-left transition-all ${
                      filtres.quand === opt.value
                        ? 'bg-[#C4622D] text-white'
                        : 'bg-[#FBF7F0] text-[#2C1810]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
