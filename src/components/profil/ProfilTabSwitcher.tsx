'use client'
import { IcChat, IcUsers, IcSpark } from './icons'

export type ProfilTab = 'mur' | 'amis' | 'utile'

interface Props {
  active: ProfilTab
  onChange: (tab: ProfilTab) => void
  amisAlert?: boolean
}

const TABS: Array<{ id: ProfilTab; label: string; Icon: typeof IcChat }> = [
  { id: 'mur',   label: 'Mur',   Icon: IcChat  },
  { id: 'amis',  label: 'Amis',  Icon: IcUsers },
  { id: 'utile', label: 'Utile', Icon: IcSpark },
]

export default function ProfilTabSwitcher({ active, onChange, amisAlert = false }: Props) {
  return (
    <div className="px-4 pt-[18px]">
      <div
        className="grid grid-cols-3 gap-0 rounded-[14px] p-1"
        style={{ background: '#F7F1E6' }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="relative inline-flex items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[13px]"
              style={{
                background: isActive ? '#FFFFFF' : 'transparent',
                boxShadow: isActive ? '0 1px 3px rgba(44,28,16,0.10)' : 'none',
                color: isActive ? '#1A1209' : '#7A6A5A',
                fontWeight: isActive ? 800 : 700,
                letterSpacing: '-0.005em',
              }}
              aria-pressed={isActive}
            >
              <Icon size={14} /> {label}
              {id === 'amis' && amisAlert && (
                <span
                  className="absolute right-2 top-[5px] block h-1.5 w-1.5 rounded-full"
                  style={{ background: '#C84B2F' }}
                  aria-label="Demandes en attente"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
