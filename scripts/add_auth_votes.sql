-- ═══════════════════════════════════════════════════════════════════════════
-- La Place du Village — Auth / Votes / Réputation
-- À exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Mise à jour de la table profiles (colonnes manquantes)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username          text,
  ADD COLUMN IF NOT EXISTS daily_post_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_post_date    date,
  ADD COLUMN IF NOT EXISTS banned            boolean NOT NULL DEFAULT false;

-- 2. Nouvelles colonnes sur evenements
ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS submitted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_name text,
  ADD COLUMN IF NOT EXISTS vote_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS publish_at        timestamptz;

-- 3. Table votes
CREATE TABLE IF NOT EXISTS votes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evenement_id uuid NOT NULL REFERENCES evenements(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evenement_id, user_id)
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public lit les votes" ON votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "User insère son vote" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "User supprime son vote" ON votes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. RLS profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public lit les profils" ON profiles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "User modifie son profil" ON profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Trigger — créer profil à l'inscription
CREATE OR REPLACE FUNCTION fn_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
    SET email        = EXCLUDED.email,
        display_name = COALESCE(profiles.display_name, EXCLUDED.display_name),
        username     = COALESCE(profiles.username, EXCLUDED.username);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_new_user_profile ON auth.users;
CREATE TRIGGER tr_new_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_new_user_profile();

-- 6. Trigger — vote_count + auto-promotion max à 10 votes
CREATE OR REPLACE FUNCTION fn_vote_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE evenements
       SET vote_count = vote_count + 1,
           promotion  = CASE
             WHEN vote_count + 1 >= 10
              AND (promotion IS NULL OR promotion IN ('basic', 'pro'))
             THEN 'max'
             ELSE promotion
           END
     WHERE id = NEW.evenement_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE evenements
       SET vote_count = GREATEST(vote_count - 1, 0)
     WHERE id = OLD.evenement_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_vote_change ON votes;
CREATE TRIGGER tr_vote_change
  AFTER INSERT OR DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION fn_vote_change();

-- 7. Publication automatique des événements utilisateurs (toutes les 5 min)
-- Active l'extension pg_cron si pas déjà fait, puis planifie la tâche
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'publish-pending-events',
  '*/5 * * * *',
  $$
    UPDATE evenements
       SET statut = 'publie'
     WHERE statut = 'en_attente'
       AND publish_at IS NOT NULL
       AND publish_at <= NOW();
  $$
);
