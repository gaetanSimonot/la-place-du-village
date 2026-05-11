-- ============================================================================
-- BACKFILL profiles.email — 2026-05-11
-- ============================================================================
-- Contexte : certains users ont profiles.email NULL parce que crees avant
-- le fix du trigger handle_new_user (ou via d'autres flux). Cela cassait
-- notifyAdmins() qui faisait sa jointure sur profiles.email.
--
-- Ce script copie l'email depuis auth.users vers profiles pour les lignes
-- ou profiles.email est NULL ou vide.
--
-- Idempotent : peut etre relance.
-- ============================================================================

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR p.email = '');

-- Verification
-- SELECT COUNT(*) AS profiles_sans_email FROM profiles WHERE email IS NULL OR email = '';
-- attendu : 0
