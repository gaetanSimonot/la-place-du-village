-- ============================================================================
-- FRIENDSHIPS — graphe social user-à-user (consentement mutuel)
-- ============================================================================
-- Idempotent. À lancer dans Supabase Dashboard → SQL Editor.
--
-- Modèle : 1 row par paire d'users (pas de doublon), avec user1_id <= user2_id
-- forcé par CHECK pour garantir l'unicité. requested_by indique qui a initié.
--
-- Statuts :
--   - pending  : demande envoyée, en attente d'acceptation
--   - accepted : amis (consentement mutuel)
--   - blocked  : prévu pour brancher un blocage plus tard (pas d'UX dans la
--                PR actuelle, juste le schema)
--
-- NB : on ne touche PAS à la table follows existante (pros / etabs).
--      Les amis sont un concept séparé user-à-user.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- 1) Table
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT         NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'accepted', 'blocked')),
  requested_by  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT friendships_pair_unique    UNIQUE (user1_id, user2_id),
  CONSTRAINT friendships_no_self        CHECK (user1_id <> user2_id),
  CONSTRAINT friendships_ordered_pair   CHECK (user1_id < user2_id),
  CONSTRAINT friendships_requested_by_member
    CHECK (requested_by IN (user1_id, user2_id))
);

COMMENT ON TABLE friendships IS
  'Graphe social user-à-user. 1 row par paire (user1_id < user2_id). status pending/accepted/blocked.';
COMMENT ON COLUMN friendships.requested_by IS
  'L''user qui a initié la demande. Doit être user1_id ou user2_id.';

-- Index pour fetch "mes amis"
CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships (user1_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships (user2_id) WHERE status = 'accepted';

-- Touch updated_at automatiquement
CREATE OR REPLACE FUNCTION friendships_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_updated_at ON friendships;
CREATE TRIGGER trg_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION friendships_touch_updated_at();


-- ──────────────────────────────────────────────────────────────────────────
-- 2) RLS — point critique sécurité
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- SELECT : seulement si je suis l'un des deux participants
DROP POLICY IF EXISTS friendships_select_member ON friendships;
CREATE POLICY friendships_select_member ON friendships
  FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- INSERT : seulement par soi-même (requested_by = auth.uid())
-- ET je dois être l'un des deux participants
-- ET le statut initial doit être pending (pas de bypass accepted/blocked)
DROP POLICY IF EXISTS friendships_insert_own ON friendships;
CREATE POLICY friendships_insert_own ON friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = requested_by
    AND auth.uid() IN (user1_id, user2_id)
    AND status = 'pending'
  );

-- UPDATE : seulement le DESTINATAIRE (= celui qui n'est PAS requested_by)
-- peut faire passer de pending à accepted. Pas d'auto-accept par l'initiateur.
-- Pour le blocage (futur) : autorisé pour les 2 participants.
DROP POLICY IF EXISTS friendships_update_accept ON friendships;
CREATE POLICY friendships_update_accept ON friendships
  FOR UPDATE
  USING (
    auth.uid() IN (user1_id, user2_id)
    AND (
      -- Cas accept : je suis destinataire d'une demande pending
      (status = 'pending' AND auth.uid() <> requested_by)
      -- Cas blocage : l'un des 2 peut bloquer à tout moment
      OR status = 'accepted'
      OR status = 'blocked'
    )
  )
  WITH CHECK (
    auth.uid() IN (user1_id, user2_id)
    AND status IN ('accepted', 'blocked')
  );

-- DELETE : les 2 participants peuvent supprimer (annuler une demande,
-- défaire un ami, retirer un blocage)
DROP POLICY IF EXISTS friendships_delete_member ON friendships;
CREATE POLICY friendships_delete_member ON friendships
  FOR DELETE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- service_role bypass (API admin avec supabaseAdmin)
DROP POLICY IF EXISTS friendships_admin_all ON friendships;
CREATE POLICY friendships_admin_all ON friendships
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────────────────
-- 3) Realtime (optionnel — utile pour rafraîchir l'UI à la réception d'une demande)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END$$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_friendships_updated_at ON friendships;
-- DROP FUNCTION IF EXISTS friendships_touch_updated_at;
-- DROP TABLE IF EXISTS friendships;
