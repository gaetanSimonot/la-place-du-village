/**
 * NOTIFICATIONS — texte et destination, source unique.
 *
 * Il existait deux dictionnaires : un complet dans NotificationsView (l'écran
 * in-app) et un second, périmé, dans push.ts. Résultat : 33 types sur 40
 * arrivaient sur le téléphone sans phrase — juste le nom de la personne — et
 * retombaient sur l'accueil au lieu de la bonne page.
 *
 * Ce module est désormais le seul endroit qui décide de ces deux choses.
 * L'écran in-app et le push l'utilisent tous les deux : un nouveau type de
 * notification se déclare ici, et les deux surfaces suivent.
 *
 * Pas de JSX ici volontairement : le fichier doit rester importable côté
 * serveur (envoi du push) comme côté client.
 */

export interface NotifLike {
  type: string
  actor_name?: string | null
  target_type?: string | null
  target_id?: string | null
}

const PHRASES: Record<string, (n: NotifLike) => string> = {
  // Producteurs / fiches
  disponibilite:          n => `${n.actor_name ?? 'Un producteur'} a un produit disponible`,
  nouveau_produit:        n => `${n.actor_name ?? 'Un producteur'} a ajouté un nouveau produit`,
  suivi_producteur:       n => `${n.actor_name ?? 'Quelqu’un'} suit votre fiche producteur`,
  commentaire:            n => `${n.actor_name ?? 'Quelqu’un'} a commenté votre fiche`,
  // Revendications
  claim_pending:          n => `Nouvelle demande${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  claim_approved:         n => `Revendication approuvée${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  claim_rejected:         n => `Revendication refusée${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  // Promotions
  promo_used:             n => `${n.actor_name ?? 'Un client'} a utilisé votre promo`,
  // Annonces
  annonce_interet_recu:   n => `${n.actor_name ?? 'Quelqu’un'} s’intéresse à votre annonce`,
  annonce_enchere_prise:  n => `${n.actor_name ?? 'Quelqu’un'} a pris votre enchère`,
  annonce_message:        n => `${n.actor_name ?? 'Quelqu’un'} vous a envoyé un message`,
  annonce_vente_close:    n => `${n.actor_name ?? 'L’autre partie'} a conclu la vente`,
  annonce_note_recue:     n => `${n.actor_name ?? 'Un acheteur'} vous a noté`,
  annonce_contact_partage: n => `${n.actor_name ?? 'Le vendeur'} a partagé son contact`,
  annonce_expire_bientot: () => 'Votre annonce expire dans 2 jours',
  annonce_devient_don:    () => 'Votre enchère a atteint le seuil — devenue un don',
  // Événements
  event_published:        n => `Événement publié${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  correction_proposee:    n => `${n.actor_name ?? 'Un utilisateur'} a proposé une correction`,
  correction_validee:     n => `Ta correction${n.actor_name ? ` sur « ${n.actor_name} »` : ''} a été validée 🙏`,
  correction_rejetee:     n => `Ta correction${n.actor_name ? ` sur « ${n.actor_name} »` : ''} n’a pas été retenue`,
  feedback_new:           n => `${n.actor_name ?? 'Un utilisateur'} a signalé un événement`,
  // Journal
  journal_publie:         () => 'Nouveau Journal du Village publié',
  journal_brouillon:      n => `Brouillon du journal prêt à relire${n.actor_name ? ` (${n.actor_name})` : ''}`,
  article_like:           n => `${n.actor_name ?? 'Un lecteur'} a aimé ton article`,
  article_comment:        n => `${n.actor_name ?? 'Un lecteur'} a commenté ton article`,
  // Covoiturage
  covoit_candidat:        n => `${n.actor_name ?? 'Un voyageur'} candidate à ton trajet`,
  covoit_message:         n => `${n.actor_name ?? 'Un utilisateur'} t’a écrit à propos d’un trajet`,
  covoit_validee:         n => `Ta place est validée${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  covoit_refusee:         n => `Candidature refusée${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  covoit_closed:          n => `Conversation covoiturage fermée${n.actor_name ? ` : ${n.actor_name}` : ''}`,
  covoit_note_recue:      n => `${n.actor_name ?? 'Un passager'} t’a noté sur ton trajet`,
  covoit_rate_invitation: n => `Trajet effectué${n.actor_name ? ` avec ${n.actor_name}` : ''} — note le conducteur`,
  // Social
  moment_nouveau:         n => `${n.actor_name ?? 'Quelqu’un'} a partagé un moment « En ce moment »`,
  friend_message:         n => `${n.actor_name ?? 'Un ami'} t’a envoyé un message`,
  friend_request_received: n => `${n.actor_name ?? 'Quelqu’un'} t’a envoyé une demande d’ami`,
  friend_request_accepted: n => `${n.actor_name ?? 'Quelqu’un'} a accepté ta demande d’ami`,
  post_broadcast:         n => `${n.actor_name ?? 'La Place du Village'} a publié`,
  support_message:        n => `${n.actor_name ?? 'Quelqu’un'} vous a écrit au support`,
  support_conversation:   n => `${n.actor_name ?? 'Quelqu’un'} a ouvert une conversation support`,
}

/**
 * La phrase à afficher. Repli sur le nom de l'acteur pour un type inconnu —
 * mieux vaut un texte pauvre qu'une notification vide si un type est ajouté
 * côté serveur avant d'être déclaré ici.
 */
export function notifPhrase(n: NotifLike): string {
  const f = PHRASES[n.type]
  return f ? f(n) : (n.actor_name || 'Nouvelle notification')
}

/** Écran des notifications — destination de repli, et cible des broadcasts. */
export const NOTIFS_URL = '/?tab=notifs'

/**
 * Où mène cette notification. Même logique pour un clic dans la liste in-app
 * et pour un clic sur la notification du téléphone.
 *
 * L'ordre des règles est significatif : les cas par `type` passent avant les
 * cas par `target_type`, parce qu'un même target_type sert à plusieurs types
 * (une correction et un événement publié pointent tous deux vers 'event').
 */
export function notifUrl(n: NotifLike, opts: { isAdmin?: boolean } = {}): string {
  const id = n.target_id
  const tt = n.target_type
  const t  = n.type

  // Publication admin : on rouvre l'écran des notifications sur ce post, ce
  // qui reproduit exactement ce que fait un clic depuis la liste in-app.
  if (t === 'post_broadcast' && id) return `${NOTIFS_URL}&post=${id}`

  if (t === 'journal_brouillon')                     return '/admin/journal'
  if (t === 'claim_pending' || tt === 'claim')       return '/admin?section=demandes'
  if ((t === 'claim_approved' || t === 'claim_rejected') && id) return `/etablissement/${id}`
  if (t === 'correction_proposee' && id)             return `/evenement/${id}?correction=1`
  if (t === 'moment_nouveau' && id)                  return `/en-ce-moment?m=${id}`

  if (tt === 'conversation' && id) {
    // covoit_* partage le target_type 'conversation' mais vit dans une autre table.
    return t.startsWith('covoit_') ? `/covoiturage/conversations/${id}` : `/annonces/conversations/${id}`
  }
  if (tt === 'covoit_conversation' && id)   return `/covoiturage/conversations/${id}`
  if (tt === 'conversation_unified' && id)  return `/conversations/${id}`
  if (tt === 'support_conversation' && id)  return opts.isAdmin ? `/admin/support/${id}` : `/support/${id}`
  if (tt === 'annonce' && id)               return `/annonces/${id}`
  if (tt === 'event' && id)                 return `/evenement/${id}`
  if (tt === 'producer' && id)              return `/producteur/${id}`
  if (tt === 'etablissement' && id)         return `/etablissement/${id}`
  if (tt === 'article' && id)               return `/journal/articles/${id}/view`
  if (tt === 'journal')                     return '/journal'
  if (tt === 'friendship')                  return '/people'
  if (tt === 'promotion')                   return '/promotions'

  // Rien de mieux : l'écran des notifications, où elle est lisible et cliquable.
  return NOTIFS_URL
}
