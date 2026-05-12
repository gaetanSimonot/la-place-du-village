-- =====================================================================
-- Fix sécurité : retirer l'accès EXECUTE aux fonctions cron annonces
-- Sans ça, anon/authenticated peuvent les appeler via PostgREST RPC
-- et déclencher manuellement baisses de prix / expirations / sponsoring.
--
-- Les jobs pg_cron eux-mêmes tournent en tant que postgres → non impactés.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.annonces_cron_baisse_encheres()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonces_cron_expirer()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonces_cron_sponsoring()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonces_cron_notif_expiration()   FROM PUBLIC, anon, authenticated;

-- Vérif : la requête suivante doit retourner uniquement postgres / service_role
-- SELECT routine_name, grantee FROM information_schema.routine_privileges
-- WHERE routine_name LIKE 'annonces_cron_%' ORDER BY routine_name, grantee;
