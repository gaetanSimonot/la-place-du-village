-- ============================================================================
-- COVOITURAGE — La Place du Village
--
-- 3 tables :
--   covoiturages              : trajets proposés
--   covoit_conversations      : 1 conv par candidat × trajet
--   covoit_messages           : messages texte + messages systèmes (validation)
--
-- Service GRATUIT — aucun appel Google Maps/Geocoding (départ/destination =
-- texte libre, le user choisit lui-même le point de récup à l'écrit).
-- ============================================================================

-- ─── Trajets ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS covoiturages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  depart          text NOT NULL,
  destination     text NOT NULL,
  date_trajet     date NOT NULL,
  heure_depart    text,                              -- "08:30", text libre pour souplesse
  prix            numeric(6,2) NOT NULL DEFAULT 0,   -- 0 = gratuit
  places          smallint NOT NULL DEFAULT 1 CHECK (places BETWEEN 1 AND 8),
  places_prises   smallint NOT NULL DEFAULT 0,
  point_recup     text,                              -- "Parking Carrefour Ganges"
  fumeur          boolean NOT NULL DEFAULT false,    -- accepte fumeur
  animaux         boolean NOT NULL DEFAULT false,    -- accepte animaux
  bagages         boolean NOT NULL DEFAULT true,     -- accepte gros bagages
  description     text,
  statut          text NOT NULL DEFAULT 'actif'
                  CHECK (statut IN ('actif','complet','annule')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_covoit_date    ON covoiturages (date_trajet);
CREATE INDEX IF NOT EXISTS idx_covoit_user    ON covoiturages (user_id);
CREATE INDEX IF NOT EXISTS idx_covoit_statut  ON covoiturages (statut);

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_covoit_updated_at ON covoiturages;
CREATE TRIGGER trg_covoit_updated_at
  BEFORE UPDATE ON covoiturages
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── Conversations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS covoit_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  covoit_id       uuid NOT NULL REFERENCES covoiturages(id) ON DELETE CASCADE,
  candidat_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conducteur_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statut          text NOT NULL DEFAULT 'open'
                  CHECK (statut IN ('open','validee','refusee','closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (covoit_id, candidat_id)
);

CREATE INDEX IF NOT EXISTS idx_covoit_conv_covoit     ON covoit_conversations (covoit_id);
CREATE INDEX IF NOT EXISTS idx_covoit_conv_candidat   ON covoit_conversations (candidat_id);
CREATE INDEX IF NOT EXISTS idx_covoit_conv_conducteur ON covoit_conversations (conducteur_id);

DROP TRIGGER IF EXISTS trg_covoit_conv_updated_at ON covoit_conversations;
CREATE TRIGGER trg_covoit_conv_updated_at
  BEFORE UPDATE ON covoit_conversations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── Messages ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS covoit_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES covoit_conversations(id) ON DELETE CASCADE,
  sender_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind            text NOT NULL DEFAULT 'text'
                  CHECK (kind IN ('text','system')),
  content         text NOT NULL,
  lu_at           timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_covoit_msg_conv      ON covoit_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_covoit_msg_unread    ON covoit_messages (conversation_id) WHERE lu_at IS NULL;

-- Touche la conv parente quand un message arrive (pour trier les listes par dernière activité)
CREATE OR REPLACE FUNCTION touch_covoit_conv_on_message() RETURNS trigger AS $$
BEGIN
  UPDATE covoit_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_covoit_msg_touch_conv ON covoit_messages;
CREATE TRIGGER trg_covoit_msg_touch_conv
  AFTER INSERT ON covoit_messages
  FOR EACH ROW EXECUTE FUNCTION touch_covoit_conv_on_message();

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- On laisse les écritures passer par supabaseAdmin (service_role) côté API.
-- Lecture publique pour les trajets (liste). Conversations + messages : membres
-- seulement.

ALTER TABLE covoiturages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE covoit_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE covoit_messages      ENABLE ROW LEVEL SECURITY;

-- covoiturages : tout le monde peut lire les trajets actifs/complets ;
-- service_role tout faire.
DROP POLICY IF EXISTS covoit_select_public ON covoiturages;
CREATE POLICY covoit_select_public ON covoiturages
  FOR SELECT
  USING (statut <> 'annule');

DROP POLICY IF EXISTS covoit_admin_all ON covoiturages;
CREATE POLICY covoit_admin_all ON covoiturages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Conversations : membres uniquement ; service_role tout.
DROP POLICY IF EXISTS covoit_conv_select_member ON covoit_conversations;
CREATE POLICY covoit_conv_select_member ON covoit_conversations
  FOR SELECT
  USING (auth.uid() = candidat_id OR auth.uid() = conducteur_id);

DROP POLICY IF EXISTS covoit_conv_admin_all ON covoit_conversations;
CREATE POLICY covoit_conv_admin_all ON covoit_conversations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Messages : membres de la conv ; service_role tout.
DROP POLICY IF EXISTS covoit_msg_select_member ON covoit_messages;
CREATE POLICY covoit_msg_select_member ON covoit_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM covoit_conversations c
      WHERE c.id = covoit_messages.conversation_id
        AND (c.candidat_id = auth.uid() OR c.conducteur_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS covoit_msg_admin_all ON covoit_messages;
CREATE POLICY covoit_msg_admin_all ON covoit_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- Active la publication realtime pour que la page chat s'update sans refetch.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'covoit_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE covoit_messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'covoit_conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE covoit_conversations';
  END IF;
END $$;
