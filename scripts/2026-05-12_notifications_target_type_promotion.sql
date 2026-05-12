-- ============================================================================
-- EXTEND notifications.target_type pour 'promotion' — 2026-05-12
-- ============================================================================
-- Le module Promotions utilise target_type='promotion' pour les notifs
-- "Jean-Pierre a utilisé votre promo". On étend le CHECK constraint.
-- ============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('producer', 'event', 'etablissement', 'claim', 'promotion'));
