-- =====================================================================
-- Profil hybride V3 — table post_comments (commentaires sur les posts)
-- Date : 2026-05-22
--
-- Contexte
-- --------
-- PR3 du profil hybride — activation des commentaires sur les posts.
-- Un commentaire est visible par tous ceux qui peuvent voir le post lui-même
-- (RLS croisée sur posts.visibility + friendships).
--
-- Texte 1..1000 chars max. Suppression par l'auteur du commentaire OU
-- l'auteur du post (modération locale).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.post_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texte      text        NOT NULL CHECK (char_length(texte) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_comments_post_id_idx
  ON public.post_comments (post_id, created_at);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- SELECT : visible si on peut voir le post (même logique que posts SELECT)
CREATE POLICY "post_comments_select" ON public.post_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_comments.post_id
      AND (
        p.visibility = 'public'
        OR p.user_id = auth.uid()
        OR (
          p.visibility = 'amis'
          AND EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.status = 'accepted'
            AND (
              (f.user1_id = auth.uid() AND f.user2_id = p.user_id)
              OR (f.user2_id = auth.uid() AND f.user1_id = p.user_id)
            )
          )
        )
      )
    )
  );

-- INSERT : auteur uniquement, et seulement si on peut voir le post
CREATE POLICY "post_comments_insert_own" ON public.post_comments
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_comments.post_id
      AND (
        p.visibility = 'public'
        OR p.user_id = auth.uid()
        OR (
          p.visibility = 'amis'
          AND EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.status = 'accepted'
            AND (
              (f.user1_id = auth.uid() AND f.user2_id = p.user_id)
              OR (f.user2_id = auth.uid() AND f.user1_id = p.user_id)
            )
          )
        )
      )
    )
  );

-- DELETE : auteur du commentaire OU auteur du post (modération locale)
CREATE POLICY "post_comments_delete" ON public.post_comments
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
