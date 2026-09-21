/**
 * LE RODAGE D'UN MODULE, EN TROIS ÉTATS.
 *
 * Un module neuf ne s'ouvre pas d'un coup à tout le village. On le pose, on le
 * regarde vivre sur son propre téléphone, puis on l'ouvre. D'où trois états et
 * pas une case à cocher :
 *
 *   masque → personne, pas même les admins
 *   admin  → les comptes admin seulement — le rodage
 *   tous   → tous les habitants
 *
 * À quoi s'ajoute une LISTE D'INVITÉS : des habitants nommés qui voient la
 * section pendant le rodage, sans être admins. Montrer un module à la
 * personne concernée — le théâtre à la programmatrice du théâtre — avant
 * de l'ouvrir au village : c'est le seul moyen d'avoir un avis sur un module
 * neuf sans faire de cette personne un administrateur de toute l'app.
 *
 * Un invité ne force RIEN. « Masqué » veut dire personne, et ça ne souffre
 * pas d'exception : un module cassé qu'on vient d'éteindre ne doit pas
 * rester allumé pour trois personnes qu'on a oublié d'enlever d'une liste.
 *
 * Ce réglage pilote une SECTION, jamais une page. Une entrée de menu ou une
 * adresse qui apparaît et disparaît selon un réglage est pire que le mal :
 * les pages de module restent accessibles et disent d'elles-mêmes quand elles
 * sont vides. C'est le bloc sur la page Village qu'on ouvre ou qu'on ferme.
 *
 * Vit ici, et pas dans le module qui l'a inventé : le cinéma, l'Assistant et
 * la radio s'en servent tous les trois, et une quatrième copie finirait par
 * diverger sur le défaut — qui est `admin`, jamais `tous`. Un module qu'on
 * oublie de régler doit rester invisible, pas s'ouvrir tout seul.
 */

export type Visibilite = 'masque' | 'admin' | 'tous'

/** Tolère les anciennes valeurs booléennes ('true'/'false'). */
export function parseVisibilite(v: string | null | undefined): Visibilite {
  if (v === 'tous' || v === 'true') return 'tous'
  if (v === 'masque') return 'masque'
  return 'admin'
}

/**
 * Ce lecteur-là voit-il la section ?
 *
 * Un seul endroit pour la règle, parce qu'elle se trompe facilement dans
 * l'autre sens : `admin && !isAdmin` se lit mal et s'inverse sans qu'on le
 * remarque.
 */
export function sectionVisible(v: Visibilite, isAdmin: boolean, invite = false): boolean {
  if (v === 'masque') return false
  if (v === 'admin') return isAdmin || invite
  return true
}

/**
 * La clé d'un module, telle que l'administration et la table `module_invites`
 * la nomment : c'est sa clé de VISIBILITÉ (`theatre_village_public`). Une
 * seule chaîne pour les deux réglages, qui ne peuvent donc pas diverger.
 *
 * La liste elle-même ne vit PAS dans `config` : cette table est lisible par
 * n'importe quel visiteur, et y ranger des identifiants de comptes
 * publierait qui a été choisi. Elle vit dans `module_invites`, fermée, lue
 * par le seul serveur — voir `invites-server.ts`.
 */

/** Les trois choix, pour les afficher dans l'admin sans les retaper. */
export const CHOIX_VISIBILITE: { v: Visibilite; titre: string; sous: string }[] = [
  { v: 'masque', titre: 'Masqué', sous: 'personne' },
  { v: 'admin',  titre: 'Admins', sous: 'rodage' },
  { v: 'tous',   titre: 'Tous',   sous: 'les habitants' },
]
