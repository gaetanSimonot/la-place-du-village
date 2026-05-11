-- ============================================================================
-- ADD user_id TO commerce_requests — 2026-05-11
-- ============================================================================
-- Contexte : commerce_requests sert a la fois pour les demandes "mon commerce
-- n'est pas liste" (anonymes) et pour les claims (revendications de fiches
-- existantes par un user connecte). Pour valider un claim, l'admin doit savoir
-- QUI a fait la demande pour assigner etablissements.user_id correctement.
--
-- Cette colonne est NULL pour les demandes anonymes, et remplie pour les claims.
--
-- Idempotent.
-- ============================================================================

ALTER TABLE public.commerce_requests
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commerce_requests_traite
  ON public.commerce_requests(traite);

CREATE INDEX IF NOT EXISTS idx_commerce_requests_user_id
  ON public.commerce_requests(user_id);
