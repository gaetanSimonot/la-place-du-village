// Ordre des sections de contenu de l'accueil (HubView).
// L'admin réordonne via /admin/hub-carousel ; l'ordre est stocké dans
// config.hub_section_order (JSON). Les parties fixes (barre, recherche, hero,
// tuiles, footer) ne sont pas concernées.

export interface HubSectionDef { id: string; label: string }

export const HUB_SECTIONS: HubSectionDef[] = [
  { id: 'aujourdhui',     label: "Aujourd'hui" },
  { id: 'plans_card',     label: 'Carte abonnement' },
  { id: 'bonsplans',      label: 'Bons plans' },
  { id: 'ventes',         label: 'Ventes' },
  { id: 'place_publique', label: 'Place publique' },
  { id: 'covoiturage',    label: 'Covoiturage' },
]

export const DEFAULT_HUB_SECTION_ORDER: string[] = HUB_SECTIONS.map(s => s.id)

/**
 * Normalise un ordre stocké : ne garde que les ids connus (dans l'ordre voulu)
 * puis complète avec les sections manquantes dans leur ordre par défaut. Ainsi
 * une nouvelle section ajoutée plus tard apparaît toujours, même si la config
 * enregistrée est antérieure.
 */
export function normalizeHubOrder(order: unknown): string[] {
  const known = new Set(DEFAULT_HUB_SECTION_ORDER)
  const wanted = Array.isArray(order)
    ? order.filter((x): x is string => typeof x === 'string' && known.has(x))
    : []
  const seen = new Set(wanted)
  return [...wanted, ...DEFAULT_HUB_SECTION_ORDER.filter(id => !seen.has(id))]
}
