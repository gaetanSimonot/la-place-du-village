-- ═══════════════════════════════════════════════════════════════════════
-- CINÉMA — la billetterie, salle par salle
--
-- Le Palace a la sienne : elle manquait, et ni le bouton « Billetterie » ni
-- les « Réserver » de chaque séance n'apparaissaient.
--
-- L'Arc-en-Ciel, lui, n'est plus rattaché à Cineode : l'adresse enregistrée
-- pour lui n'est donc plus la bonne, et mieux vaut aucune billetterie qu'une
-- billetterie qui emmène ailleurs. L'écran affiche « bientôt » à la place,
-- jusqu'à ce que la vraie soit connue.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE etablissements
   SET billetterie_url = 'https://www.cineode.fr/le-vigan-le-palace/'
 WHERE module_cinema = true AND slug = 'vigan';

UPDATE etablissements
   SET billetterie_url = NULL
 WHERE module_cinema = true AND slug = 'ganges';
