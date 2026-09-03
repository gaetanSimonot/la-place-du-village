-- 2026-08-29 — Fiches établissement invisibles sur la carte
--
-- SYMPTÔME
--   Un commerçant crée sa fiche, la retrouve en la CHERCHANT dans la liste,
--   mais aucune punaise n'apparaît sur la carte.
--
-- CAUSE
--   Les deux routes de création (POST /api/commerce-request auto-publié, et
--   PATCH /api/admin/commerce-requests action=approve_create) omettaient le
--   champ `statut` pour laisser le DEFAULT de la table s'appliquer. Ce DEFAULT
--   vaut 'imported'. Or la lecture publique (/api/etablissements, qui alimente
--   la carte ET la liste parcourue) filtre `.in('statut', ['publie','actif'])`.
--   La fiche naissait donc invisible, et aucun écran ne la repêchait ensuite.
--   Seule la recherche live du BottomSheet la trouvait : elle interroge la base
--   en direct, sans filtre de statut.
--
-- CORRECTIF CODE (déjà appliqué, même commit)
--   Les deux routes écrivent désormais `statut: 'actif'` explicitement.
--   ('publie' est refusé par le CHECK de la colonne — la valeur visible côté
--   public est 'actif'.)
--
-- CE SCRIPT
--   Rattrape les fiches déjà créées et restées bloquées. Au 29/08/2026 elles
--   sont 12, toutes issues d'une demande utilisateur (vérifié par jointure sur
--   commerce_requests), certaines en attente depuis mai. Toutes ont des
--   coordonnées valides : elles apparaîtront sur la carte dès l'exécution.
--
--   Le filtre exclut volontairement les fiches SANS coordonnées : une fiche
--   sans lat/lng n'a pas de punaise possible et n'a rien à faire en 'actif'
--   tant que son adresse n'est pas géocodée (il n'y en a aucune aujourd'hui,
--   la clause est là pour les rejeux futurs).
--
--   Rejouable sans risque : après le premier passage il ne reste plus rien à
--   mettre à jour.
--
--   NOTE — scripts/scrape-google-places.ts écrit lui aussi statut='imported'
--   (ligne 257). C'est volontaire de son côté : un import Google massif ne doit
--   pas se publier tout seul. Ne PAS jouer ce script juste après un scrape sans
--   avoir trié les fiches importées au préalable.

-- Contrôle AVANT — liste ce qui va être publié
SELECT id, nom, commune, type, created_at
FROM etablissements
WHERE statut = 'imported'
  AND lat IS NOT NULL
  AND lng IS NOT NULL
ORDER BY created_at DESC;

-- Mise à jour
UPDATE etablissements
SET statut = 'actif'
WHERE statut = 'imported'
  AND lat IS NOT NULL
  AND lng IS NOT NULL;

-- Contrôle APRÈS — doit renvoyer 0 pour 'imported' avec coordonnées
SELECT statut, count(*) AS nb
FROM etablissements
GROUP BY statut
ORDER BY nb DESC;

-- ROLLBACK (si besoin) — repasser en 'imported' les 12 fiches concernées.
-- Les ids exacts au moment du correctif :
--   Cevennes Créatives, ATELIER LAVILLA, La Guinguette de la Vis, Puck Pizza,
--   Savonnerie de la Bueges, L'été indien, Biocoop Bio Ensemble,
--   La Guinguette d'Avèze, Les Arts Tisanes, La Cantine BioEnsemble,
--   Adiou ma fille!, Malika Cécile Naturopathe
-- UPDATE etablissements SET statut = 'imported'
-- WHERE nom IN ('Cevennes Créatives', 'ATELIER LAVILLA', ...);
