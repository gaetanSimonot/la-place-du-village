-- ============================================================================
-- FIL DU VILLAGE — flag "posté sur le groupe village" sur les posts — 2026-07-01
-- ============================================================================
-- Un post avec sur_village = true apparaît sur le MUR de son auteur ET dans le
-- FIL DU VILLAGE (groupe public, façon groupe Facebook). Un post sans le flag
-- reste sur le mur perso de l'auteur uniquement.
-- Idempotent.
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS sur_village boolean NOT NULL DEFAULT false;

-- Index partiel pour le feed du village (posts village, plus récents d'abord).
CREATE INDEX IF NOT EXISTS posts_sur_village_idx
  ON public.posts (created_at DESC)
  WHERE sur_village = true;

-- ============================================================================
-- RLS : inchangé. La policy posts_select existante autorise déjà la lecture des
-- posts publics par tout le monde → les posts village publics sont lisibles.
-- Vérification : SELECT id, sur_village FROM public.posts LIMIT 5;
-- ============================================================================
