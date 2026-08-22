import { GANGES_LAT, GANGES_LNG } from '@/lib/assistant/config'

/**
 * MÉTÉO — la seule donnée que l'assistant va chercher HORS de La Place du
 * Village. SERVEUR UNIQUEMENT.
 *
 * Open-Meteo : gratuit, sans clé, sans compte. On n'envoie que des
 * coordonnées — celles du bourg, jamais celles de la personne : « il pleut
 * demain » se décide à l'échelle du secteur, pas de la rue.
 *
 * Cache mémoire d'une heure. Une prévision à sept jours ne bouge pas de
 * minute en minute, et l'assistant peut la demander à chaque conversation.
 */

interface Jour {
  date: string
  ciel: string
  temp_min: number | null
  temp_max: number | null
  pluie_mm: number | null
  /** Le seul champ dont le modèle a vraiment besoin pour trancher. */
  dehors_conseille: boolean
}

let cache: { at: number; jours: Jour[] } | null = null
const TTL = 60 * 60 * 1000

/** Codes WMO → une phrase, pas un code. */
function ciel(code: number): string {
  if (code === 0) return 'grand soleil'
  if (code <= 2) return 'quelques nuages'
  if (code === 3) return 'couvert'
  if (code <= 48) return 'brouillard'
  if (code <= 57) return 'bruine'
  if (code <= 67) return 'pluie'
  if (code <= 77) return 'neige'
  if (code <= 82) return 'averses'
  if (code <= 86) return 'averses de neige'
  return 'orage'
}

async function charger(): Promise<Jour[]> {
  const now = Date.now()
  if (cache && now - cache.at < TTL) return cache.jours

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${GANGES_LAT}&longitude=${GANGES_LNG}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
    '&timezone=Europe%2FParis&forecast_days=7'

  // Timeout court : la météo est un confort. Si elle ne répond pas, la
  // réponse se fait sans elle plutôt que de faire attendre la personne.
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    const d = j?.daily
    const jours: Jour[] = (d?.time ?? []).map((date: string, i: number) => {
      const code = Number(d.weather_code?.[i] ?? 3)
      const pluie = Number(d.precipitation_sum?.[i] ?? 0)
      return {
        date,
        ciel: ciel(code),
        temp_min: d.temperature_2m_min?.[i] ?? null,
        temp_max: d.temperature_2m_max?.[i] ?? null,
        pluie_mm: pluie,
        // Seuil volontairement franc : sous 2 mm on sort couvert, au-delà on
        // propose l'intérieur. Une nuance de plus n'aiderait pas le modèle.
        dehors_conseille: code < 51 && pluie < 2,
      }
    })
    cache = { at: now, jours }
    return jours
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

/** La prévision d'un jour, ou de quoi dire qu'on ne sait pas. */
export async function meteoJour(date: string): Promise<Record<string, unknown>> {
  const jours = await charger()
  if (!jours.length) {
    return { indisponible: true, note: 'Météo indisponible : répondez sans en tenir compte, sans le signaler.' }
  }
  const jour = jours.find(j => j.date === date)
  if (!jour) {
    return {
      indisponible: true,
      note: 'Pas de prévision pour cette date (au-delà de 7 jours). Répondez sans en tenir compte.',
    }
  }
  return { ...jour, lieu: 'Ganges et alentours' }
}
