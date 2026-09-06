import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Copie figée de l'élément joint à une publication.
 *
 * Une publication ne gardait qu'une RÉFÉRENCE (embed_kind + embed_ref_id) et
 * rechargeait l'élément à chaque affichage. Or les éléments du village ont une
 * durée de vie : un événement est supprimé pour de bon deux jours après sa fin
 * (/api/admin/cleanup). Le jour venu, la publication qui l'annonçait affichait
 * « Élément supprimé » et perdait tout son sens — alors que le concert avait
 * bien eu lieu et que le message racontait quelque chose.
 *
 * On garde donc une copie de la vignette au moment de la publication. Tant que
 * l'élément vit, on affiche les données FRAÎCHES (une date corrigée doit se
 * voir) ; quand il disparaît, la copie prend le relais et la carte reste
 * lisible, simplement plus cliquable.
 *
 * Volontairement minimal : titre, sous-titre, photo. Pas de lien — un lien
 * figé mènerait à une page morte. L'adresse se recalcule depuis le type et
 * l'identifiant tant que la cible existe.
 */
export interface EmbedSnapshot {
  /** Titre affiché sur la vignette. */
  t: string
  /** Sous-titre : commune, catégorie, date… selon le type. */
  s: string | null
  /** URL de l'image. Distante : elle peut mourir avec l'élément. */
  p: string | null
  /** Date de la capture, pour savoir de quand datent ces informations. */
  at: string
}

/** Types acceptés comme élément joint. Aligné sur ALLOWED_KINDS (/api/posts). */
export const EMBED_KINDS = ['event', 'etab', 'producer', 'annonce', 'promo', 'covoit', 'article', 'debat'] as const

/**
 * Ce qui est affiché quand l'élément a disparu. Formulé par type : un
 * événement purgé n'a pas été « supprimé », il est passé — et le dire
 * autrement laisse croire à une modération.
 */
export const EMBED_DISPARU: Record<string, string> = {
  event:   'Événement passé',
  annonce: 'Annonce clôturée',
  promo:   'Promotion terminée',
  covoit:  'Trajet terminé',
  etab:    'Fiche retirée',
  producer:'Fiche retirée',
  article: 'Article retiré',
  debat:   'Débat retiré',
}

const texte = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

const premierePhoto = (v: unknown): string | null =>
  Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null

/** Les médias du forum sont des objets `{ t: 'photo', url }`, pas des chaînes. */
const premierePhotoMedia = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null
  for (const it of v) {
    const u = (it as { t?: string; url?: unknown })?.url
    if ((it as { t?: string })?.t === 'photo' && typeof u === 'string') return u
  }
  return null
}

/**
 * Lit l'élément et en fait une copie figée. `null` s'il est introuvable ou si
 * le type est inconnu — l'appelant enregistre alors la publication sans copie
 * plutôt que d'échouer : perdre la vignette est moins grave que perdre le
 * message.
 */
export async function construireEmbedSnapshot(
  db: SupabaseClient,
  kind: string,
  refId: string,
): Promise<EmbedSnapshot | null> {
  const fige = (t: string | null, s: string | null, p: string | null): EmbedSnapshot | null =>
    t ? { t, s, p, at: new Date().toISOString() } : null

  try {
    if (kind === 'event') {
      const { data } = await db
        .from('evenements')
        .select('titre, image_url, lieux(commune)')
        .eq('id', refId).maybeSingle()
      if (!data) return null
      const brut = (data as { lieux?: { commune?: string | null } | { commune?: string | null }[] | null }).lieux
      const lieu = Array.isArray(brut) ? brut[0] : brut
      return fige(texte(data.titre), texte(lieu?.commune), texte(data.image_url))
    }

    // Un débat de la Place publique. Son corps sert de sous-titre : c'est ce
    // qui donne envie de l'ouvrir, le titre seul étant souvent une question.
    if (kind === 'debat') {
      const { data } = await db
        .from('forum_topics').select('titre, corps, media').eq('id', refId).maybeSingle()
      if (!data) return null
      const corps = String(data.corps ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const extrait = corps ? (corps.length > 90 ? corps.slice(0, 90).trimEnd() + '…' : corps) : null
      return fige(texte(data.titre), extrait, premierePhotoMedia(data.media))
    }

    if (kind === 'etab') {
      const { data } = await db
        .from('etablissements').select('nom, commune, photos').eq('id', refId).maybeSingle()
      if (!data) return null
      return fige(texte(data.nom), texte(data.commune), premierePhoto(data.photos))
    }

    if (kind === 'producer') {
      const { data } = await db
        .from('producers').select('nom, commune, photos').eq('id', refId).maybeSingle()
      if (!data) return null
      return fige(texte(data.nom), texte(data.commune), premierePhoto(data.photos))
    }

    if (kind === 'annonce') {
      const { data } = await db
        .from('annonces').select('titre, photos, type, categorie').eq('id', refId).maybeSingle()
      if (!data) return null
      return fige(texte(data.titre), texte(data.categorie) ?? texte(data.type), premierePhoto(data.photos))
    }

    if (kind === 'promo') {
      const { data } = await db
        .from('promotions').select('title, image_url').eq('id', refId).maybeSingle()
      if (!data) return null
      return fige(texte(data.title) ?? 'Promotion', null, texte(data.image_url))
    }

    if (kind === 'covoit') {
      const { data } = await db
        .from('covoiturages').select('depart, destination, date_trajet').eq('id', refId).maybeSingle()
      if (!data) return null
      const jour = data.date_trajet
        ? new Date(data.date_trajet as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        : null
      return fige(`${data.depart} → ${data.destination}`, jour, null)
    }

    if (kind === 'article') {
      const { data } = await db
        .from('articles_journal').select('titre, corps, photo_url').eq('id', refId).maybeSingle()
      if (!data) return null
      const corps = String(data.corps ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const extrait = corps ? (corps.length > 80 ? corps.slice(0, 80).trimEnd() + '…' : corps) : null
      return fige(texte(data.titre), extrait, texte(data.photo_url))
    }

    return null
  } catch {
    // Une copie manquante n'empêche pas de publier.
    return null
  }
}
