-- Favoris annonces — table + RLS
-- Contexte : équivalent strict d'event_favorites pour les annonces.
-- Branchement : hook useAnnonceFavorites + routes /api/annonces/[id]/favorite
-- et /api/profile/annonce-favorites.
-- Règle : chaque utilisateur ne voit et ne touche que ses propres lignes.

CREATE TABLE IF NOT EXISTS annonce_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  annonce_id  uuid NOT NULL REFERENCES annonces(id)   ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, annonce_id)
);

CREATE INDEX IF NOT EXISTS annonce_favorites_user_idx     ON annonce_favorites (user_id);
CREATE INDEX IF NOT EXISTS annonce_favorites_annonce_idx  ON annonce_favorites (annonce_id);

ALTER TABLE annonce_favorites ENABLE ROW LEVEL SECURITY;

-- Idempotence : on droppe d'abord (CREATE POLICY pas idempotent en PG)
DROP POLICY IF EXISTS "annonce_favorites: select own" ON annonce_favorites;
DROP POLICY IF EXISTS "annonce_favorites: insert own" ON annonce_favorites;
DROP POLICY IF EXISTS "annonce_favorites: delete own" ON annonce_favorites;

CREATE POLICY "annonce_favorites: select own"
  ON annonce_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "annonce_favorites: insert own"
  ON annonce_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "annonce_favorites: delete own"
  ON annonce_favorites FOR DELETE
  USING (auth.uid() = user_id);
