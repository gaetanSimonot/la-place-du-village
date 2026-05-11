-- ============================================================================
-- EXTEND notifications.target_type CHECK constraint — 2026-05-11
-- ============================================================================
-- Contexte : la table notifications avait un CHECK constraint qui n'acceptait
-- que target_type IN ('producer', 'event'). Mes nouvelles notifications de
-- claim utilisent 'claim' (cote admin) et 'etablissement' (cote requester),
-- valeurs rejetees silencieusement -> aucune notif creee.
--
-- Ce script drop le constraint existant et le recree avec la liste etendue.
-- Idempotent.
-- ============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('producer', 'event', 'etablissement', 'claim'));

-- ============================================================================
-- Verification post-execution :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'notifications_target_type_check';
-- Doit retourner : CHECK ((target_type IS NULL) OR (target_type = ANY (...)))
-- ============================================================================
