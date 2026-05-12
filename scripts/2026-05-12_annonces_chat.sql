-- =====================================================================
-- Mini-chat 1-to-1 sur les annonces — La Place du Village
-- Date : 2026-05-12
--
-- Workflow :
--  1. Acheteur clique "Contacter le vendeur" sur /annonces/[id]
--  2. Une conversation est créée (ou récupérée si existe déjà)
--  3. Acheteur et vendeur échangent des messages texte
--  4. Vendeur peut "Partager mes coordonnées" → message-système avec tel/email de l'annonce
--  5. L'un ou l'autre peut "✓ Conclure la vente" → annonce passe en vendu, conv close
--
-- Conv unique par couple (annonce_id, acheteur_id).
-- =====================================================================

-- =====================================================================
-- 1. CONVERSATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id   uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  acheteur_id  uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  vendeur_id   uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  statut       text NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  closed_by    uuid REFERENCES auth.users(id),
  UNIQUE (annonce_id, acheteur_id)
);

COMMENT ON COLUMN public.annonces_conversations.statut IS 'open | closed';

CREATE INDEX IF NOT EXISTS idx_conversations_annonce       ON public.annonces_conversations (annonce_id);
CREATE INDEX IF NOT EXISTS idx_conversations_acheteur      ON public.annonces_conversations (acheteur_id);
CREATE INDEX IF NOT EXISTS idx_conversations_vendeur       ON public.annonces_conversations (vendeur_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at    ON public.annonces_conversations (updated_at DESC);

-- =====================================================================
-- 2. MESSAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.annonces_conversations(id) ON DELETE CASCADE,
  sender_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL pour les messages système
  kind            text NOT NULL DEFAULT 'text',                       -- 'text' | 'system_contact' | 'system_closed'
  content         text NOT NULL,
  lu_at           timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.annonces_messages.kind IS 'text | system_contact | system_closed';

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.annonces_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread       ON public.annonces_messages (conversation_id, lu_at) WHERE lu_at IS NULL;

-- =====================================================================
-- 3. TRIGGER — updated_at sur conversations quand un message arrive
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annonces_conv_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE public.annonces_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conv_touch ON public.annonces_messages;
CREATE TRIGGER trg_conv_touch
  AFTER INSERT ON public.annonces_messages
  FOR EACH ROW EXECUTE FUNCTION public.annonces_conv_touch_updated_at();

-- =====================================================================
-- 4. RLS — owner-only (acheteur ou vendeur)
-- =====================================================================
ALTER TABLE public.annonces_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonces_messages      ENABLE ROW LEVEL SECURITY;

-- Conversations : visible aux 2 membres uniquement
DROP POLICY IF EXISTS conv_select_members ON public.annonces_conversations;
CREATE POLICY conv_select_members ON public.annonces_conversations
  FOR SELECT
  USING (auth.uid() = acheteur_id OR auth.uid() = vendeur_id);

-- Messages : visibles aux 2 membres de la conv
DROP POLICY IF EXISTS msg_select_members ON public.annonces_messages;
CREATE POLICY msg_select_members ON public.annonces_messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.annonces_conversations
      WHERE acheteur_id = auth.uid() OR vendeur_id = auth.uid()
    )
  );

-- Toutes les écritures passent par les API routes via supabaseAdmin (service role).
-- RLS bloque par défaut, le service role bypasse.

-- =====================================================================
-- 5. Étendre notifications.target_type pour 'conversation' (clic notif → ouvre chat)
-- =====================================================================
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('producer', 'event', 'etablissement', 'claim', 'promotion', 'annonce', 'conversation'));
