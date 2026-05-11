-- ============================================================================
-- FIX TRIGGER PROFILES — 2026-05-11
-- ============================================================================
-- CONTEXTE
-- L'ancien trigger handle_new_user() tente d'insérer sur la colonne `id` de
-- profiles, mais cette colonne n'existe pas — elle s'appelle `user_id`.
-- Conséquence : tous les nouveaux signups échouent silencieusement avec
-- "Database error saving new user" → les copains ne peuvent pas s'inscrire.
--
-- État DB constaté (2026-05-11) :
--   - 3 users dans auth.users
--   - 2 profils dans public.profiles
--   - 1 user orphelin (sans profil)
--   - 1 trigger actif : on_auth_user_created → handle_new_user() (cassé)
--
-- CE QUE FAIT CE SCRIPT
--   1. Drop le trigger et la fonction cassés (et la version concurrente jamais déployée)
--   2. Recrée une fonction propre qui insère sur les BONNES colonnes
--   3. Recrée le trigger
--   4. Backfill le user orphelin (et tout futur user orphelin)
--   5. Pose des RLS minimales cohérentes sur profiles
--
-- IDEMPOTENT : peut être relancé autant de fois que nécessaire sans dégât.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Nettoyage de l'existant (les deux versions de triggers)
-- ──────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_new_user_profile  ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.fn_new_user_profile();


-- ──────────────────────────────────────────────────────────────────────────
-- 2. Nouvelle fonction — insère sur user_id (la vraie colonne)
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    avatar_url,
    plan,
    banned
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    'basic',
    false
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────
-- 3. Trigger
-- ──────────────────────────────────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ──────────────────────────────────────────────────────────────────────────
-- 4. Backfill — crée une ligne profiles pour chaque auth.users orphelin
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO public.profiles (user_id, email, display_name, avatar_url, plan, banned)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data->>'avatar_url',
  'basic',
  false
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
);


-- ──────────────────────────────────────────────────────────────────────────
-- 5. RLS — pose des policies cohérentes (et drop les anciennes incompatibles)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop les anciennes policies (certaines référencent peut-être `id` au lieu de `user_id`)
DROP POLICY IF EXISTS "Lecture profil personnel"     ON public.profiles;
DROP POLICY IF EXISTS "Création profil personnel"    ON public.profiles;
DROP POLICY IF EXISTS "Modification profil personnel" ON public.profiles;
DROP POLICY IF EXISTS "Public lit les profils"       ON public.profiles;
DROP POLICY IF EXISTS "User modifie son profil"      ON public.profiles;
DROP POLICY IF EXISTS "profiles: public read"        ON public.profiles;
DROP POLICY IF EXISTS "profiles: user updates own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: user inserts own"   ON public.profiles;

-- Lecture publique : le code app affiche les noms/avatars d'autres users
-- (commentaires, voters, profils publics, etc.) → SELECT doit être ouvert
CREATE POLICY "profiles: public read"
  ON public.profiles FOR SELECT
  USING (true);

-- Update : chaque user ne peut modifier que son propre profil
CREATE POLICY "profiles: user updates own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Insert : autorisé pour soi-même (filet de sécurité si le trigger échoue)
CREATE POLICY "profiles: user inserts own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note : pas de DELETE policy → personne ne peut supprimer un profil côté client.
-- L'admin passe par supabaseAdmin (service role) qui bypasse RLS.


-- ============================================================================
-- VÉRIFICATIONS POST-EXÉCUTION (à lancer après ce script)
-- ============================================================================
--
-- 1. Plus de user orphelin :
--      SELECT COUNT(*) AS users_sans_profile
--      FROM auth.users u
--      WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id);
--      → doit retourner 0
--
-- 2. Trigger actif :
--      SELECT trigger_name FROM information_schema.triggers
--      WHERE event_object_schema = 'auth' AND event_object_table = 'users';
--      → doit retourner exactement 'on_auth_user_created'
--
-- 3. Test bout-en-bout :
--      a. Inscris-toi avec un email neuf (magic link ou Google)
--      b. Vérifie qu'une ligne profiles existe avec ce user_id et plan='basic'
-- ============================================================================
