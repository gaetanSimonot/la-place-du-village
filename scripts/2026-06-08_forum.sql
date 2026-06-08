-- La Place Publique (forum) — 2026-06-08
-- ============================================================================
-- Sujets (topics) que tout user connecté peut créer, fil de réponses en chat
-- live, sondages, épinglage admin, modération.
-- Lecture publique (RLS SELECT true) ; toutes les écritures passent par les
-- routes API en service_role (qui revérifient auth + admin).
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_topics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titre            text NOT NULL CHECK (char_length(titre) BETWEEN 1 AND 200),
  corps            text CHECK (corps IS NULL OR char_length(corps) <= 5000),
  media            jsonb,
  poll             jsonb,   -- { "question": "...", "options": ["A","B", ...] }
  pinned           boolean     NOT NULL DEFAULT false,
  comment_count    integer     NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forum_topics_sort
  ON public.forum_topics (pinned DESC, comment_count DESC, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texte       text NOT NULL CHECK (char_length(texte) BETWEEN 1 AND 5000),
  reply_to_id uuid REFERENCES public.forum_comments(id) ON DELETE SET NULL,  -- citation
  edited_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forum_comments_topic
  ON public.forum_comments (topic_id, created_at);

CREATE TABLE IF NOT EXISTS public.forum_poll_votes (
  topic_id     uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)   -- 1 vote / personne / sujet
);

-- ── RLS : lecture publique ; écritures = service_role (API) ──────────────────
ALTER TABLE public.forum_topics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forum_topics_read     ON public.forum_topics;
DROP POLICY IF EXISTS forum_comments_read   ON public.forum_comments;
DROP POLICY IF EXISTS forum_poll_votes_read ON public.forum_poll_votes;
CREATE POLICY forum_topics_read     ON public.forum_topics     FOR SELECT USING (true);
CREATE POLICY forum_comments_read   ON public.forum_comments   FOR SELECT USING (true);
CREATE POLICY forum_poll_votes_read ON public.forum_poll_votes FOR SELECT USING (true);

-- ── Trigger : comment_count + last_activity_at ───────────────────────────────
CREATE OR REPLACE FUNCTION public.forum_touch_topic() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_topics
      SET comment_count = comment_count + 1, last_activity_at = now()
      WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_topics
      SET comment_count = GREATEST(0, comment_count - 1)
      WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_forum_touch_topic ON public.forum_comments;
CREATE TRIGGER trg_forum_touch_topic
  AFTER INSERT OR DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.forum_touch_topic();

-- ── Realtime (live) ──────────────────────────────────────────────────────────
-- Si déjà ajoutées, ces lignes erreurent "already member" — sans danger, ignore.
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_poll_votes;
