import { FiltreQuand } from './types'

export function getDateRange(quand: FiltreQuand): { from: string; to: string } | null {
  if (quand === 'toujours') return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // toISOString() donne l'heure UTC — en France (UTC+2) minuit local = 22h UTC
  // la veille, ce qui décale toutes les dates. On utilise les composantes locales.
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (quand === 'aujourd_hui') {
    return { from: fmt(today), to: fmt(today) }
  }

  if (quand === 'ce_week_end') {
    const day = today.getDay() // 0=dim, 6=sam
    const diffSam = day === 6 ? 0 : (6 - day)
    const sam = new Date(today)
    sam.setDate(today.getDate() + diffSam)
    const dim = new Date(sam)
    dim.setDate(sam.getDate() + 1)
    return { from: fmt(sam), to: fmt(dim) }
  }

  if (quand === 'cette_semaine') {
    const day = today.getDay()
    const diffLun = day === 0 ? -6 : 1 - day
    const lun = new Date(today)
    lun.setDate(today.getDate() + diffLun)
    const dim = new Date(lun)
    dim.setDate(lun.getDate() + 6)
    return { from: fmt(lun), to: fmt(dim) }
  }

  if (quand === 'ce_mois') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { from: fmt(first), to: fmt(last) }
  }

  return null
}

export function formatDate(dateStr: string, style: 'court' | 'long' = 'court'): string {
  const date = new Date(dateStr + 'T12:00:00')
  if (style === 'long') {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date)
  }
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long',
  }).format(date)
}
