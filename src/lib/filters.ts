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
    const day = today.getDay() // 0=dim, 1=lun, ..., 5=ven, 6=sam
    // Vendredi du week-end courant ou prochain
    let diffVen: number
    if (day === 5) diffVen = 0       // vendredi → aujourd'hui
    else if (day === 6) diffVen = -1  // samedi → vendredi dernier
    else if (day === 0) diffVen = -2  // dimanche → vendredi il y a 2 jours
    else diffVen = 5 - day            // lun–jeu → prochain vendredi
    const ven = new Date(today)
    ven.setDate(today.getDate() + diffVen)
    const dim = new Date(ven)
    dim.setDate(ven.getDate() + 2) // ven → sam → dim
    return { from: fmt(ven), to: fmt(dim) }
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
