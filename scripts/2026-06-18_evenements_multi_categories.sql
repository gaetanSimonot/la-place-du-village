-- 2026-06-18 — Multi-catégories pour les événements
--
-- Objectif : un événement peut désormais porter PLUSIEURS catégories
-- (ex. "concert" + "theatre" pour une soirée mixte / une fusion d'events).
--
-- Stratégie rétro-compatible :
--   • on AJOUTE une colonne `categories text[]` (le tableau des catégories)
--   • on GARDE `categorie` (= catégorie principale = categories[1]) pour que
--     tout le code existant qui lit `categorie` continue de fonctionner même
--     si le déploiement précède d'autres MAJ.
--   • le code applicatif écrit TOUJOURS les deux (categorie = categories[0]).
--
-- À JOUER EN PROD AVANT de déployer le code multi-catégories.
-- Idempotent : rejouable sans erreur.

-- 1. Colonne tableau
ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- 2. Backfill : toute ligne sans `categories` hérite de [categorie]
UPDATE evenements
SET categories = ARRAY[categorie]
WHERE categorie IS NOT NULL
  AND (categories IS NULL OR categories = '{}');

-- 3. Index GIN pour les filtres par recouvrement (operator && / .overlaps)
--    → /api/agenda filtre les events dont UNE des catégories matche le filtre.
CREATE INDEX IF NOT EXISTS idx_evenements_categories
  ON evenements USING gin (categories);
