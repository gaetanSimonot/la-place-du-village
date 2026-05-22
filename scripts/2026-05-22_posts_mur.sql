-- =====================================================================
-- Profil hybride V3 — tables posts + post_likes (Mur de publications V1)
-- Date : 2026-05-22
--
-- Contexte
-- --------
-- PR3 du profil hybride. L'onglet Mur du profil permet à un utilisateur
-- de publier un post texte court visible :
--   - public  → tout le monde
--   - amis    → seulement ses amis acceptés (table friendships)
--   - prive   → seulement lui
--
-- V1 simple : juste texte + visibility. Pas de photo, embed, ni
-- commentaires (tables prêtes à étendre en PR future).
--
-- Likes : table dédiée post_likes (PK composite user_id+post_id), RLS
-- ouverte en lecture, écriture/suppression scope auth.uid().
-- =====================================================================

-- ─── Table posts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texte       text        NOT NULL CHECK (char_length(texte) BETWEEN 1 AND 2000),
  visibility  text        NOT NULL DEFAULT 'public'
              CHECK (visibility IN ('public', 'amis', 'prive')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_user_id_created_at_idx
  ON public.posts (user_id, created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- SELECT : public visible par tous · prive visible par auteur ·
--          amis visible par auteur + amis acceptés (friendships)
CREATE POLICY "posts_select" ON public.posts
  FOR SELECT
  USING (
    visibility = 'public'
    OR user_id = auth.uid()
    OR (
      visibility = 'amis'
      AND EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
        AND (
          (f.user1_id = auth.uid() AND f.user2_id = posts.user_id)
          OR (f.user2_id = auth.uid() AND f.user1_id = posts.user_id)
        )
      )
    )
  );

-- INSERT : uniquement sur son propre user_id
CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- DELETE : uniquement ses propres posts
CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE
  USING (user_id = auth.uid());

-- ─── Table post_likes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_likes_post_id_idx ON public.post_likes (post_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- SELECT : tout le monde voit les likes (count public)
CREATE POLICY "post_likes_select_all" ON public.post_likes
  FOR SELECT USING (true);

-- INSERT : uniquement son propre like
CREATE POLICY "post_likes_insert_own" ON public.post_likes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- DELETE : uniquement son propre like (unlike)
CREATE POLICY "post_likes_delete_own" ON public.post_likes
  FOR DELETE
  USING (user_id = auth.uid());

-- ─── Realtime (optionnel — pour rafraîchir le mur en live) ───────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;

-- Vérification :
--   SELECT * FROM public.posts LIMIT 1;
--   SELECT * FROM public.post_likes LIMIT 1;
