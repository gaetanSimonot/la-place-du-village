-- =====================================================================
-- Annonces : type « covoiturage » + sens « je propose / je cherche »
-- Date : 2026-10-27
--
-- Le type n'a pas de CHECK en base (validé côté API) : 'covoiturage'
-- passe sans migration. Seule la colonne `sens` est à créer.
--
-- sens : 'propose' (défaut, toutes les annonces existantes) | 'cherche'.
-- Seuls les types service et covoiturage l'utilisent ; l'API force
-- 'propose' pour les autres.
-- =====================================================================

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS sens text NOT NULL DEFAULT 'propose';

COMMENT ON COLUMN public.annonces.sens IS 'propose | cherche (service et covoiturage seulement)';
