-- ============================================================================
-- EXTEND notifications.target_type pour 'annonce' — 2026-05-12
-- ============================================================================
-- Bug : les notifs du module Annonces (target_type='annonce') étaient
-- rejetées silencieusement par le CHECK constraint, donc le posteur ne
-- recevait jamais l'alerte d'intérêt / enchère prise.
-- ============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('producer', 'event', 'etablissement', 'claim', 'promotion', 'annonce'));
