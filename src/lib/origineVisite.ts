/**
 * D'OÙ VIENT CETTE PERSONNE, ET COMBIEN DE FOIS EST-ELLE REVENUE ?
 *
 * Quelqu'un qui arrive d'une recherche Google cherchait une réponse, pas une
 * app : on ne lui demande pas d'activer les notifications à sa première
 * visite. On attend qu'il revienne (SEUIL_VISITES). Tous les autres — l'app
 * installée, un lien partagé, une personne qui connaît déjà La Place — ne
 * voient AUCUN changement.
 *
 * « Venu par une recherche » se décide UNE fois, à la toute première visite
 * de ce navigateur, et seulement s'il n'a aucune trace d'usage antérieur :
 * un habitué qui passe un jour par Google reste un habitué.
 *
 * Une visite = une session de navigateur (un onglet ouvert depuis Google, une
 * ouverture de l'app), comptée une fois.
 */
const CLE = 'pdv-origine-visite'
const CLE_SESSION = 'pdv-visite-comptee'
export const SEUIL_VISITES = 3

const MOTEURS = /^https?:\/\/([^/]+\.)?(google|bing|duckduckgo|qwant|ecosia|yahoo|yandex|startpage|search\.brave|lilo)\.[a-z.]+(\/|$)/i

/** Clés posées par l'app à l'usage : leur présence dit « déjà venu ». */
const TRACES = ['pdv-welcome-shown', 'pdv-max-seen', 'pdv-favoris', 'pdv-push-prompt-done']

interface Origine { recherche: boolean; visites: number }

function lire(): Origine | null {
  try {
    const brut = localStorage.getItem(CLE)
    return brut ? (JSON.parse(brut) as Origine) : null
  } catch { return null }
}

/** Compte la visite en cours (une fois par session). Sans effet ailleurs. */
export function noterVisite(): Origine | null {
  if (typeof window === 'undefined') return null
  try {
    let o = lire()
    if (!o) {
      const habitue = TRACES.some(k => localStorage.getItem(k) !== null)
      o = { recherche: !habitue && MOTEURS.test(document.referrer || ''), visites: 0 }
    }
    if (!sessionStorage.getItem(CLE_SESSION)) {
      sessionStorage.setItem(CLE_SESSION, '1')
      o = { ...o, visites: o.visites + 1 }
    }
    localStorage.setItem(CLE, JSON.stringify(o))
    return o
  } catch { return null }
}

/** Venu par une recherche et pas encore revenu assez souvent. */
export function nouveauVenuParRecherche(): boolean {
  const o = noterVisite()
  return !!o && o.recherche && o.visites < SEUIL_VISITES
}
