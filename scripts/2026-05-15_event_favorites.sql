-- =====================================================================
-- EVENT FAVORITES — 2026-05-15
-- =====================================================================
-- Stocke les favoris événement des users connectés.
-- Les anonymes continuent à utiliser localStorage `pdv-favoris`.
-- Au login, le hook useFavorites importe les IDs locaux dans cette table
-- puis clear le localStorage.
--
-- Convention : même schéma que producer_favorites / etab_favorites.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.event_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.evenements(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_favorites_user  ON public.event_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_event_favorites_event ON public.event_favorites (event_id);

ALTER TABLE public.event_favorites ENABLE ROW LEVEL SECURITY;

-- RLS : owner read/write own only
DROP POLICY IF EXISTS event_fav_select_own ON public.event_favorites;
CREATE POLICY event_fav_select_own ON public.event_favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS event_fav_insert_own ON public.event_favorites;
CREATE POLICY event_fav_insert_own ON public.event_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_fav_delete_own ON public.event_favorites;
CREATE POLICY event_fav_delete_own ON public.event_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Vérif :
-- SELECT to_regclass('public.event_favorites');
