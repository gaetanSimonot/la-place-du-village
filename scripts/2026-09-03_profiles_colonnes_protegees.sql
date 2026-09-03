-- 2026-09-03 — Protéger les colonnes sensibles de profiles
--
-- PROBLÈME (vérifié en production le 03/09/2026)
--   La policy « profiles: user updates own » autorise chaque personne à
--   modifier SA ligne :
--       ON public.profiles FOR UPDATE
--       USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--
--   RLS Postgres filtre les LIGNES, pas les COLONNES. Rien n'empêche donc un
--   compte connecté d'écrire, depuis la console du navigateur et avec la clé
--   anon (publique, présente dans le bundle JS) :
--
--       supabase.from('profiles').update({ plan: 'pro' }).eq('user_id', monId)
--
--   → il devient Partenaire Local sans payer. Même chose pour `banned` (un
--   compte banni se débannit), `is_verified` (badge vérifié), `etab_quota`
--   (quota d'établissements) et `email` (identité du compte).
--
--   Aucun code de l'app n'écrit ces colonnes côté client — les écritures
--   légitimes passent toutes par supabaseAdmin (service role) : webhook
--   Stripe pour `plan`, /api/admin/membres pour l'attribution manuelle.
--   Ce script ne casse donc aucun parcours existant.
--
-- CORRECTIF
--   RLS ne sachant pas raisonner par colonne, on pose un trigger BEFORE UPDATE
--   qui refuse ces modifications quand l'appel vient d'un client (rôle `anon`
--   ou `authenticated`). Le service role et le SQL direct passent librement.
--
-- NE CORRIGE PAS
--   La lecture. `profiles: public read` (USING true) laisse la clé anon lire
--   TOUTES les colonnes de TOUS les profils, sans même être connecté — emails
--   et newsletter_token compris. Vérifié le 03/09/2026 : 261 profils lisibles.
--   Le correctif est un GRANT par colonne, mais il casse trois endroits qui
--   lisent `email` ou `*` côté client (evenement/[id]/client.tsx:598,
--   CommentSheet.tsx:200, profil/[id]/client.tsx:174). À traiter à part.

-- Filet : la colonne du quota peut ne pas encore exister selon l'ordre des
-- migrations. Idempotent, sans effet si elle est déjà là.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS etab_quota integer;

CREATE OR REPLACE FUNCTION public.profiles_colonnes_protegees()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  role_appelant text := coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'role',
    ''
  );
BEGIN
  -- Appels serveur (service_role) et SQL direct (rôle absent des claims) :
  -- aucune restriction. Ce sont les seuls chemins légitimes.
  IF role_appelant NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.plan        IS DISTINCT FROM OLD.plan
  OR NEW.banned      IS DISTINCT FROM OLD.banned
  OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
  OR NEW.etab_quota  IS DISTINCT FROM OLD.etab_quota
  OR NEW.email       IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION
      'Champ protégé : plan, banned, is_verified, etab_quota et email ne peuvent être modifiés que par le serveur'
      USING ERRCODE = '42501';   -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_colonnes_protegees ON public.profiles;

CREATE TRIGGER trg_profiles_colonnes_protegees
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_colonnes_protegees();

-- ─────────────────────────────────────────────────────────────────────────
-- VÉRIFICATIONS
--
-- 1. Le trigger est posé :
--      SELECT tgname FROM pg_trigger
--      WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
--
-- 2. Le SQL direct passe toujours (doit réussir, puis remettre la valeur) :
--      UPDATE profiles SET plan = plan WHERE user_id = '<un uuid>';
--
-- 3. Le blocage côté client se teste depuis la console du navigateur, connecté :
--      await supabase.from('profiles').update({ plan: 'pro' }).eq('user_id', '<son uuid>')
--      → doit renvoyer une erreur 42501, et le plan ne doit pas bouger.
--
-- ROLLBACK
--      DROP TRIGGER IF EXISTS trg_profiles_colonnes_protegees ON public.profiles;
--      DROP FUNCTION IF EXISTS public.profiles_colonnes_protegees();
-- ─────────────────────────────────────────────────────────────────────────
