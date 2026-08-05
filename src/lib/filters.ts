import { FiltreQuand } from './types'

export function getDateRange(quand: FiltreQuand): { from: string; to: string } | null {
  if (quand === 'toujours') return null

  // Force Europe/Paris : indépendant du fuseau système (Vercel tourne en UTC
  // par défaut, peu importe la région physique). On extrait Y-M-D vus de Paris
  // puis on reconstruit un Date pour que les calculs week-end/mois en aval
  // (today.getDay/getDate) restent corrects en composantes locales.
  const _parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const _y = _parts.find(p => p.type === 'year')!.value
  const _m = _parts.find(p => p.type === 'month')!.value
  const _d = _parts.find(p => p.type === 'day')!.value
  const today = new Date(`${_y}-${_m}-${_d}T00:00:00`)
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

/**
 * Normalise une chaîne pour la recherche texte : minuscules + accents retirés.
 * `Épinard` et `epinard` produisent la même clé, donc la saisie sans accent
 * (le cas courant au clavier mobile) trouve quand même la fiche.
 */
export function normSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Label pour vignettes d'événement gérant les multi-jours (expos…).
 * Si l'event a une date_fin différente, on affiche "Jusqu'au DD mois"
 * plutôt que la date de début qui peut être passée et tromper l'utilisateur.
 */
export function formatEventDate(
  date_debut: string | null,
  date_fin: string | null,
  style: 'court' | 'long' = 'court',
): string {
  if (!date_debut) return ''
  if (date_fin && date_fin !== date_debut) {
    const fin = new Date(date_fin + 'T12:00:00')
    const fmt = style === 'long'
      ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(fin)
      : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(fin)
    return `Jusqu'au ${fmt}`
  }
  return formatDate(date_debut, style)
}
