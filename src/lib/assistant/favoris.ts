import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Carte } from '@/lib/assistant/outils'

/**
 * ASSISTANT VILLAGE — le cœur sur les fiches. SERVEUR UNIQUEMENT.
 *
 * Chaque fiche proposée porte son cœur, rempli ou non selon ce que la
 * personne a déjà gardé. Sans cela, il faudrait ouvrir l'aperçu pour savoir —
 * et surtout, garder une sortie demanderait deux gestes au lieu d'un, ce qui
 * suffit à ne jamais le faire.
 *
 * L'état est lu ICI, côté serveur, pendant qu'on prépare la réponse : une
 * requête par famille de fiches présente dans le lot, et rien de plus. Le
 * demander depuis l'écran coûterait un aller-retour par carte.
 */

/** Où vivent les favoris, et sous quel nom l'objet y est désigné. */
const TABLES: Record<string, { table: string; colonne: string } | undefined> = {
  ev:      { table: 'event_favorites',          colonne: 'event_id' },
  etab:    { table: 'etablissement_favorites',  colonne: 'etablissement_id' },
  prod:    { table: 'producer_favorites',       colonne: 'producer_id' },
  annonce: { table: 'annonce_favorites',        colonne: 'annonce_id' },
  promo:   { table: 'promotion_favorites',      colonne: 'promotion_id' },
  // Un film n'est pas un favori : c'est la séance ou la salle qu'on garde.
  film:    undefined,
}

/**
 * Pose `favori: true|false` sur chaque carte gardable.
 *
 * Sans compte, on ne pose rien : le cœur reste absent plutôt que vide, car un
 * cœur vide promet un geste qui échouera. Une erreur de lecture laisse la
 * carte telle quelle — un favori non affiché est un désagrément, une réponse
 * bloquée serait une panne.
 */
export async function marquerFavoris(cartes: Carte[], userId: string | null): Promise<void> {
  if (!userId || !cartes.length) return

  const parType = new Map<string, string[]>()
  for (const c of cartes) {
    if (!TABLES[c.type]) continue
    const l = parType.get(c.type) ?? []
    l.push(c.id)
    parType.set(c.type, l)
  }
  if (!parType.size) return

  await Promise.all(Array.from(parType.entries()).map(async ([type, ids]) => {
    const t = TABLES[type]!
    try {
      const { data } = await supabaseAdmin
        .from(t.table).select(t.colonne)
        .eq('user_id', userId)
        .in(t.colonne, ids)
      const gardes = new Set(
        ((data ?? []) as unknown as Record<string, unknown>[]).map(r => String(r[t.colonne])),
      )
      for (const c of cartes) {
        if (c.type === type) c.data.favori = gardes.has(c.id)
      }
    } catch { /* la carte s'affichera sans son cœur */ }
  }))
}
