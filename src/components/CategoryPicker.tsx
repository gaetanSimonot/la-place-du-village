'use client'

export interface CategoryItem {
  id: string
  label: string
  color?: string
  emoji?: string
}

interface Props {
  items: CategoryItem[]
  activeId: string | null | undefined
  onChange: (id: string | null) => void
  accent?: string
  ariaLabel: string
}

/**
 * Picker de catégorie horizontal : pills cliquables, scroll si besoin.
 * "Tout" en première position. Stop la propagation pointer/touch pour
 * éviter de drag le bottom sheet quand on tape une pill.
 */
export default function CategoryPicker({
  items, activeId, onChange,
  accent = '#2D5A3D',
  ariaLabel,
}: Props) {
  const isTout = !activeId

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      className="pdv-cat-picker"
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '2px 0 4px',
        touchAction: 'pan-x',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Pill "Tout" */}
      <button
        type="button"
        role="option"
        aria-selected={isTout}
        onClick={() => onChange(null)}
        style={{
          flexShrink: 0,
          height: 32,
          padding: '0 14px',
          borderRadius: 16,
          border: `1.5px solid ${accent}`,
          background: isTout ? accent : 'transparent',
          color: isTout ? '#fff' : accent,
          fontFamily: 'Inter, sans-serif',
          fontSize: 12.5,
          fontWeight: isTout ? 800 : 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Tout
      </button>

      {items.map(item => {
        const isActive = item.id === activeId
        const color = item.color ?? accent
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={isActive}
            onClick={() => onChange(isActive ? null : item.id)}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 32,
              padding: '0 12px',
              borderRadius: 16,
              border: `1.5px solid ${color}`,
              background: isActive ? color : 'transparent',
              color: isActive ? '#fff' : color,
              fontFamily: 'Inter, sans-serif',
              fontSize: 12.5,
              fontWeight: isActive ? 800 : 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {item.emoji && <span style={{ fontSize: 13 }}>{item.emoji}</span>}
            {item.label}
          </button>
        )
      })}

      <style jsx>{`
        .pdv-cat-picker { scrollbar-width: none; }
        .pdv-cat-picker::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
