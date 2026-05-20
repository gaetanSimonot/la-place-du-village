-- Article journal : système de likes + commentaires
-- Mêmes patterns que les commentaires d'événement (commentable_id ref article_journal.id)

-- 1. Likes : PK composite (article_id + user_id) = un user ne peut liker qu'une fois
CREATE TABLE IF NOT EXISTS article_likes (
  article_id uuid REFERENCES articles_journal(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);
CREATE INDEX IF NOT EXISTS article_likes_article_idx ON article_likes (article_id);

ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS article_likes_read_all ON article_likes;
CREATE POLICY article_likes_read_all ON article_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS article_likes_insert_own ON article_likes;
CREATE POLICY article_likes_insert_own ON article_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS article_likes_delete_own ON article_likes;
CREATE POLICY article_likes_delete_own ON article_likes
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS article_likes_admin_all ON article_likes;
CREATE POLICY article_likes_admin_all ON article_likes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');


-- 2. Comments : id unique + parent_id pour threading 1 niveau
CREATE TABLE IF NOT EXISTS article_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES articles_journal(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_id  uuid REFERENCES article_comments(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS article_comments_article_idx ON article_comments (article_id, created_at DESC);

ALTER TABLE article_comments ENABLE ROW LEVEL SECURITY;

-- Lecture publique des commentaires d'articles publiés
DROP POLICY IF EXISTS article_comments_read_all ON article_comments;
CREATE POLICY article_comments_read_all ON article_comments
  FOR SELECT USING (true);

-- Insert : doit être authentifié, le user_id doit matcher auth.uid()
DROP POLICY IF EXISTS article_comments_insert_own ON article_comments;
CREATE POLICY article_comments_insert_own ON article_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update : owner uniquement (édition de son propre commentaire)
DROP POLICY IF EXISTS article_comments_update_own ON article_comments;
CREATE POLICY article_comments_update_own ON article_comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Delete : owner uniquement
DROP POLICY IF EXISTS article_comments_delete_own ON article_comments;
CREATE POLICY article_comments_delete_own ON article_comments
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS article_comments_admin_all ON article_comments;
CREATE POLICY article_comments_admin_all ON article_comments
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_article_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS article_comments_updated_at ON article_comments;
CREATE TRIGGER article_comments_updated_at
  BEFORE UPDATE ON article_comments
  FOR EACH ROW EXECUTE FUNCTION update_article_comments_updated_at();
