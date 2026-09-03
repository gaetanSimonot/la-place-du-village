-- 2026-09-03 — Fermer la lecture publique des e-mails
--
-- PROBLÈME (mesuré en production le 03/09/2026)
--   La policy « profiles: public read » (USING true) ouvre le SELECT à tous.
--   C'est VOULU et nécessaire : l'app affiche des noms et des avatars partout
--   (commentaires, forum, votants, profils publics). Sans elle, ces écrans se
--   vident.
--
--   L'angle mort n'est pas la ligne, c'est la colonne. RLS filtre les LIGNES ;
--   il n'a aucune notion de colonne. « tout le monde voit tous les profils »
--   voulait dire noms et avatars — ça incluait aussi `email`.
--
--   Vérifié : avec la clé anon (publique, présente dans le bundle JS), SANS
--   être connecté, une seule requête HTTP renvoie 261 profils avec leur
--   adresse e-mail et leur newsletter_token.
--
-- CORRECTIF
--   Les privilèges Postgres, eux, savent raisonner par colonne. On retire le
--   SELECT global aux rôles publics et on le redonne colonne par colonne.
--   RLS continue de filtrer les lignes, les privilèges filtrent les colonnes.
--
--   `service_role` (toutes les routes API via supabaseAdmin) n'est pas touché :
--   les écrans admin, la newsletter et les envois d'e-mails continuent de
--   fonctionner comme avant.
--
-- COLONNES RETIRÉES AUX CLIENTS
--   email                    donnée personnelle, cœur du problème
--   newsletter_token         permet de désinscrire quelqu'un à sa place
--   newsletter_optin         état marketing ; l'app y accède déjà par
--   newsletter_invited_at    /api/newsletter/me (route serveur)
--   newsletter_welcomed_at
--   etab_quota               quota de fiches, aucun usage côté client
--
--   `banned` reste lisible : capabilities.ts s'en sert côté client pour
--   calculer les droits. Ce n'est pas une donnée personnelle, et son écriture
--   est déjà verrouillée par le trigger de 2026-09-03_profiles_colonnes_protegees.
--
-- PRÉREQUIS
--   Le code qui accompagne ce script DOIT être déployé AVANT de le jouer.
--   Quatre écrans faisaient `select('*')` sur profiles : après ce script,
--   Postgres refuserait la requête ENTIÈRE (une seule colonne interdite suffit
--   à faire échouer un `SELECT *`). Les colonnes y sont désormais énumérées.
--
-- ATTENTION POUR PLUS TARD
--   Une colonne AJOUTÉE à profiles ne sera PAS lisible par les clients tant
--   qu'elle n'est pas ajoutée au GRANT ci-dessous. C'est volontaire (on échoue
--   fermé, jamais ouvert), mais il faut y penser en ajoutant une colonne
--   destinée à l'affichage.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  user_id,
  display_name,
  avatar_url,
  banner_url,
  bio,
  ville,
  username,
  genre,
  link_url,
  plan,
  pro_type,
  is_verified,
  is_public,
  searchable,
  display_settings,
  banned,
  updated_at
) ON public.profiles TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- VÉRIFICATIONS
--
-- 1. Colonnes réellement lisibles par le public (email ne doit PAS y être) :
--      SELECT column_name FROM information_schema.column_privileges
--      WHERE table_name = 'profiles' AND grantee = 'anon' AND privilege_type = 'SELECT'
--      ORDER BY column_name;
--
-- 2. Test grandeur nature, depuis un terminal, avec la clé ANON :
--      curl "<SUPABASE_URL>/rest/v1/profiles?select=email&limit=1" \
--           -H "apikey: <CLE_ANON>"
--      → doit renvoyer une erreur « permission denied for column email »
--
--      curl "<SUPABASE_URL>/rest/v1/profiles?select=display_name&limit=1" \
--           -H "apikey: <CLE_ANON>"
--      → doit continuer de fonctionner
--
-- 3. À vérifier dans l'app après déploiement : commentaires d'un événement,
--    suggestions de mention (@), liste des votants, page profil public,
--    compteur de membres sur /people.
--
-- ROLLBACK (rouvre la lecture, à n'utiliser qu'en urgence)
--      GRANT SELECT ON public.profiles TO anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────
