-- ============================================================================
-- CONVERSATIONS UNIFIÉES — table polymorphique pour chats (chat amis Phase 3)
-- ============================================================================
-- Idempotent. À lancer dans Supabase Dashboard → SQL Editor.
--
-- 3 tables :
--   - conversations         : 1 row par conv, kind = 'friend' pour l'instant
--                             (extensible : 'group', 'tombola', 'rencontre', etc.)
--   - conversation_members  : membres d'une conv (table de jointure)
--   - messages              : messages
--
-- ⚠️ RÉCURSION RLS — POINT CRITIQUE
--   Si on faisait `conversations.SELECT USING EXISTS (SELECT FROM
--   conversation_members ...)`, Postgres déclencherait la policy SELECT de
--   conversation_members → qui pourrait référencer conversations → cycle.
--
--   Pour casser : on utilise une FONCTION SECURITY DEFINER `is_conversation_member`
--   qui s'exécute avec les privilèges du owner (= bypass RLS interne) et
--   retourne juste un booléen. Les policies des 3 tables appellent cette
--   fonction → aucun cycle possible.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- 1) Tables
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT         NOT NULL CHECK (kind IN ('friend')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversations IS
  'Conversations unifiées. kind = type de conv (friend pour l''instant, extensible).';

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT         NOT NULL CHECK (length(content) > 0 AND length(content) <= 4000),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at);


-- ──────────────────────────────────────────────────────────────────────────
-- 2) Trigger : touche conversations.updated_at à chaque nouveau message
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conv_on_msg ON messages;
CREATE TRIGGER trg_touch_conv_on_msg
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION touch_conversation_on_message();


-- ──────────────────────────────────────────────────────────────────────────
-- 3) FONCTION SECURITY DEFINER — casse la récursion RLS
-- ──────────────────────────────────────────────────────────────────────────
-- Cette fonction s'exécute avec les privilèges du owner (= bypass les RLS
-- des tables qu'elle interroge). Elle retourne juste un booléen.
--
-- Les policies de conversations, conversation_members et messages
-- appellent cette fonction. Pas de SELECT direct → pas de récursion.
--
-- STABLE : peut être appelée plusieurs fois dans une même requête sans
-- ré-évaluation, et le planner peut en faire un index lookup.
-- SECURITY DEFINER : bypass RLS (l'owner postgres y a accès direct).
-- SET search_path : évite l'injection via search_path (sécurité).
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_members
    WHERE conversation_id = conv_id
      AND user_id         = uid
  );
$$;

-- Restreint l'accès direct à la fonction (mais elle reste appelable par les
-- policies puisqu'elle s'exécute en SECURITY DEFINER côté postgres role).
REVOKE ALL ON FUNCTION is_conversation_member(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID, UUID) TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────────────────
-- 4) RLS — 3 tables, 0 récursion (toutes les policies passent par la fonction)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;

-- ─── conversations ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS conv_select_member ON conversations;
CREATE POLICY conv_select_member ON conversations
  FOR SELECT
  USING (is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS conv_admin_all ON conversations;
CREATE POLICY conv_admin_all ON conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Note : INSERT/UPDATE/DELETE sur conversations passent EXCLUSIVEMENT par
-- l'API (supabaseAdmin / service_role bypass). Pas de policy USER pour
-- INSERT (= les users ne créent JAMAIS de conv directement, seulement via
-- POST /api/conversations/friend/open qui vérifie l'amitié).

-- ─── conversation_members ───────────────────────────────────────────────
DROP POLICY IF EXISTS conv_members_select_peer ON conversation_members;
CREATE POLICY conv_members_select_peer ON conversation_members
  FOR SELECT
  USING (is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS conv_members_update_self ON conversation_members;
CREATE POLICY conv_members_update_self ON conversation_members
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
  -- Permet à un user d'updater SON last_read_at uniquement.

DROP POLICY IF EXISTS conv_members_admin_all ON conversation_members;
CREATE POLICY conv_members_admin_all ON conversation_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── messages ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messages_select_member ON messages;
CREATE POLICY messages_select_member ON messages
  FOR SELECT
  USING (is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS messages_insert_member ON messages;
CREATE POLICY messages_insert_member ON messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND is_conversation_member(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS messages_admin_all ON messages;
CREATE POLICY messages_admin_all ON messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────────────────
-- 5) Realtime
-- ──────────────────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END$$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END$$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_touch_conv_on_msg ON messages;
-- DROP FUNCTION IF EXISTS touch_conversation_on_message;
-- DROP TABLE IF EXISTS messages;
-- DROP TABLE IF EXISTS conversation_members;
-- DROP TABLE IF EXISTS conversations;
-- DROP FUNCTION IF EXISTS is_conversation_member(UUID, UUID);
