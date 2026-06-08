-- La Place Publique (forum) — Likes sur les sujets — 2026-06-08
-- ============================================================================
-- À jouer APRÈS 2026-06-08_forum.sql. Ajoute le "J'aime" sur les sujets :
-- compteur dénormalisé (like_count) maintenu par trigger + table de likes
-- (1 like / personne / sujet). Lecture publique, écritures via API service_role.
-- ============================================================================

-- Compteur dénormalisé sur les sujets (affichage liste / bento sans agrégat)
ALTER TABLE public.forum_topics
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

-- Table des likes
CREATE TABLE IF NOT EXISTS public.forum_topic_likes (
  topic_id   uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)   -- 1 like / personne / sujet
);
CREATE INDEX IF NOT EXISTS idx_forum_topic_likes_topic
  ON public.forum_topic_likes (topic_id);

-- RLS : lecture publique ; écritures = service_role (API)
ALTER TABLE public.forum_topic_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forum_topic_likes_read ON public.forum_topic_likes;
CREATE POLICY forum_topic_likes_read ON public.forum_topic_likes FOR SELECT USING (true);

-- Trigger : like_count
CREATE OR REPLACE FUNCTION public.forum_touch_likes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_topics SET like_count = like_count + 1 WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_topics SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_forum_touch_likes ON public.forum_topic_likes;
CREATE TRIGGER trg_forum_touch_likes
  AFTER INSERT OR DELETE ON public.forum_topic_likes
  FOR EACH ROW EXECUTE FUNCTION public.forum_touch_likes();

-- Realtime (si déjà ajoutée : "already member", sans danger)
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_topic_likes;
