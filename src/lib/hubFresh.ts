/**
 * Fraîcheur du payload /api/hub.
 *
 * /api/hub est mis en cache 60s par le CDN (`s-maxage=60` +
 * `stale-while-revalidate=120`) : c'est ce qui fait charger l'accueil en
 * <100ms, mais ça veut aussi dire qu'un refetch normal retape sur la copie
 * périmée. Une mise en avant mettait donc jusqu'à 3 min à apparaître, même
 * avec le Realtime branché.
 *
 * Deux contournements, tous les deux côté client :
 *
 * 1. `hubBustParam()` — ajoute `&t=<tranche de 5s>` à l'URL. L'URL change,
 *    donc le CDN doit aller chercher l'origine. MAIS tous les clients d'une
 *    même tranche de 5 secondes tapent la MÊME URL : un seul hit origine,
 *    pas un par téléphone connecté. Fraîcheur garantie à 5s près.
 *
 * 2. `markHubDirty()` / `takeHubDirty()` — le Realtime ne prévient que les
 *    écrans où l'accueil est déjà monté. Quand on met un contenu en avant
 *    depuis l'admin ou une fiche, l'accueil n'est pas monté : on pose un
 *    drapeau, et le prochain affichage de l'accueil force un fetch frais.
 */

const KEY = 'pdv-hub-dirty'
/** Au-delà, le drapeau est périmé : le cache CDN a de toute façon tourné. */
const DIRTY_TTL_MS = 10 * 60 * 1000

/** Suffixe d'URL qui contourne le cache CDN, mutualisé par tranche de 5s. */
export function hubBustParam(): string {
  return `&t=${Math.floor(Date.now() / 5000)}`
}

/** À appeler après toute écriture qui change l'accueil (mise en avant…). */
export function markHubDirty(): void {
  try { localStorage.setItem(KEY, String(Date.now())) } catch { /* navigation privée */ }
}

/** Vrai une seule fois, si une écriture récente attend d'être affichée. */
export function takeHubDirty(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    localStorage.removeItem(KEY)
    return Date.now() - Number(raw) < DIRTY_TTL_MS
  } catch { return false }
}
