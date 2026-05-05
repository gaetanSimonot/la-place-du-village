-- RLS policies : producer_followers, producer_favorites, notes_admin
-- Contexte : le client navigateur (anon key) lit et écrit directement ces tables
-- depuis useProducerFavorites.ts et FavorisView.tsx.
-- Règle : chaque utilisateur ne voit et ne touche que ses propres lignes.

-- ── producer_followers ───────────────────────────────────────────────────────

ALTER TABLE producer_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "producer_followers: select own"
  ON producer_followers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "producer_followers: insert own"
  ON producer_followers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "producer_followers: delete own"
  ON producer_followers FOR DELETE
  USING (auth.uid() = user_id);

-- ── producer_favorites ───────────────────────────────────────────────────────

ALTER TABLE producer_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "producer_favorites: select own"
  ON producer_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "producer_favorites: insert own"
  ON producer_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "producer_favorites: delete own"
  ON producer_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- ── notes_admin : supprimée (aucune référence dans le code) ─────────────────

DROP TABLE IF EXISTS notes_admin;
