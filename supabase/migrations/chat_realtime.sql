-- ============================================================================
-- CHATS REALTIME — Phase 0
-- ============================================================================
-- Active la publication realtime pour les 3 systèmes de chat existants.
-- Le code client (subscribe + cleanup) est déjà en place dans :
--   - src/app/annonces/conversations/[convId]/client.tsx:130
--   - src/app/covoiturage/conversations/[convId]/client.tsx:59
--   - src/app/support/[convId]/client.tsx:83
-- Sans ces ALTER PUBLICATION, postgres_changes ne reçoit rien depuis Supabase.
--
-- À lancer dans Supabase Dashboard → SQL Editor.
-- Idempotent : chaque ADD TABLE est dans un DO/EXCEPTION qui ignore le
-- duplicate_object (= déjà présent dans la publication).
--
-- Reversible :
--   ALTER PUBLICATION supabase_realtime DROP TABLE annonces_messages;
--   ALTER PUBLICATION supabase_realtime DROP TABLE covoit_messages;
--   ALTER PUBLICATION supabase_realtime DROP TABLE covoit_conversations;
--   ALTER PUBLICATION supabase_realtime DROP TABLE support_messages;
-- ============================================================================

-- Messages annonces (INSERT → nouveau message dans le chat)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE annonces_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END$$;

-- Messages covoiturage (INSERT → nouveau message)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE covoit_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END$$;

-- Conversations covoit (UPDATE → changement de statut validee/refusee/closed)
-- Le client covoit écoute aussi les UPDATE de cette table pour réagir au
-- changement de statut en direct (cf. client.tsx:67-70).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE covoit_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END$$;

-- Messages support (INSERT → nouveau message ticket)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END$$;
