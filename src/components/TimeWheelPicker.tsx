'use client'
import { useEffect, useMemo, useState } from 'react'
import { WheelPicker, WheelPickerWrapper } from '@ncdai/react-wheel-picker'
import '@ncdai/react-wheel-picker/style.css'

/**
 * TIME WHEEL PICKER — modal bottom-sheet façon iOS
 *
 * Affiche 2 wheels verticales (heures 00-23 + minutes par pas de 5) et
 * renvoie la valeur sélectionnée au format "HH:MM" via `onConfirm`.
 *
 * Usage :
 *   const [open, setOpen] = useState(false)
 *   <TimeWheelPicker open={open} value={heure} onClose={() => setOpen(false)}
 *     onConfirm={(hhmm) => { setHeure(hhmm); setOpen(false) }} />
 */

interface Props {
  open: boolean
  /** "HH:MM" ou "" — valeur initiale */
  value: string
  /** Pas en minutes (default 5) */
  step?: number
  onClose: () => void
  onConfirm: (hhmm: string) => void
}

export default function TimeWheelPicker({
  open, value, step = 5, onClose, onConfirm,
}: Props) {
  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => ({ value: h, label: h })),
    [],
  )
  const minutes = useMemo(
    () => Array.from({ length: Math.floor(60 / step) }, (_, i) => String(i * step).padStart(2, '0')).map(m => ({ value: m, label: m })),
    [step],
  )

  // Parse value or default "08:00"
  const initH = value && /^\d{2}:\d{2}$/.test(value) ? value.slice(0, 2) : '08'
  const initM = value && /^\d{2}:\d{2}$/.test(value) ? value.slice(3, 5) : '00'
  // Snap initM au step le plus proche
  const initMSnapped = String(Math.round(parseInt(initM, 10) / step) * step).padStart(2, '0')

  const [h, setH] = useState(initH)
  const [m, setM] = useState(initMSnapped)

  // Reset quand la modal s'ouvre avec une nouvelle valeur
  useEffect(() => {
    if (open) { setH(initH); setM(initMSnapped) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-4 pb-6 pt-4"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
      >
        {/* Grabber */}
        <div className="mx-auto mb-3 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        {/* Titre */}
        <div className="mb-3 text-center">
          <p className="m-0 font-serif text-[18px] text-texte" style={{ letterSpacing: '-0.01em' }}>
            Heure de départ
          </p>
        </div>

        {/* Wheels */}
        <div className="mx-auto flex max-w-[280px] items-center justify-center gap-3">
          <div className="flex-1">
            <WheelPickerWrapper className="pdv-wheel-wrapper">
              <WheelPicker
                options={hours}
                value={h}
                onValueChange={setH}
                visibleCount={5}
                optionItemHeight={36}
                classNames={{
                  optionItem:       'pdv-wp-item',
                  highlightWrapper: 'pdv-wp-highlight',
                  highlightItem:    'pdv-wp-highlight-item',
                }}
              />
            </WheelPickerWrapper>
          </div>
          <div className="font-serif text-[22px] text-texte-doux">:</div>
          <div className="flex-1">
            <WheelPickerWrapper className="pdv-wheel-wrapper">
              <WheelPicker
                options={minutes}
                value={m}
                onValueChange={setM}
                visibleCount={5}
                optionItemHeight={36}
                classNames={{
                  optionItem:       'pdv-wp-item',
                  highlightWrapper: 'pdv-wp-highlight',
                  highlightItem:    'pdv-wp-highlight-item',
                }}
              />
            </WheelPickerWrapper>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-bord bg-white py-3 text-[13px] font-bold text-texte-doux"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(`${h}:${m}`)}
            className="flex-1 rounded-2xl bg-primary py-3 text-[13px] font-bold text-white"
          >
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}
