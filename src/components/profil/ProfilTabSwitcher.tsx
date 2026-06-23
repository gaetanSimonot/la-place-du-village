'use client'
import { IcChat, IcUsers, IcSpark, IcVideo } from './icons'

export type ProfilTab = 'mur' | 'reels' | 'amis' | 'utile'

interface Props {
  active: ProfilTab
  onChange: (tab: ProfilTab) => void
  amisAlert?: boolean
  /** Tabs à afficher. Si non fournie, les 3 sont affichées. */
  visibleTabs?: ProfilTab[]
}

const ALL_TABS: Array<{ id: ProfilTab; label: string; Icon: typeof IcChat }> = [
  { id: 'mur',   label: 'Mur',   Icon: IcChat  },
  { id: 'reels', label: 'Reels', Icon: IcVideo },
  { id: 'amis',  label: 'Amis',  Icon: IcUsers },
  { id: 'utile', label: 'Utile', Icon: IcSpark },
]

export default function ProfilTabSwitcher({ active, onChange, amisAlert = false, visibleTabs }: Props) {
  const tabs = visibleTabs
    ? ALL_TABS.filter(t => visibleTabs.includes(t.id))
    : ALL_TABS
  if (tabs.length === 0) return null
  const gridCols = tabs.length >= 4 ? 'grid-cols-4' : tabs.length === 3 ? 'grid-cols-3' : tabs.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className="px-4 pt-[18px]">
      <div
        className={`grid ${gridCols} gap-0 rounded-[14px] p-1`}
        style={{ background: '#F7F1E6' }}
      >
        {tabs.map(({ id, label, Icon }) => {
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
