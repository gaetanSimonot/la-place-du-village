-- =====================================================================
-- Chat support 1-to-N (user ↔ équipe admin) — La Place du Village
-- Date : 2026-05-16
--
-- Workflow :
--  1. User clique sur le bouton "i" du Hub → AppInfoModal
--  2. User tape un message dans "Contacter l'équipe" → POST /api/support/conversations
--  3. Une support_conversation est créée + 1er support_message + notifyAdmins(support_message)
--  4. Un admin clique sur la notif → /admin/support/[convId]
--  5. Admin répond → notif au user (type 'support_message')
--  6. User retrouve la conv via la notif ou /support/[convId]
--
-- Plusieurs convs possibles par user (chaque "ticket" est séparé).
-- Pas de admin_id : n'importe quel admin peut répondre.
-- =====================================================================

-- =====================================================================
-- 1. CONVERSATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statut      text NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  subject     text,                          -- résumé court généré depuis 1er message (optionnel)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz,
  closed_by   uuid REFERENCES auth.users(id)
);

COMMENT ON COLUMN public.support_conversations.statut IS 'open | closed';

CREATE INDEX IF NOT EXISTS idx_support_conv_user       ON public.support_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_updated_at ON public.support_conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conv_statut     ON public.support_conversations (statut);

-- =====================================================================
-- 2. MESSAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_is_admin boolean NOT NULL DEFAULT false,
  content         text NOT NULL,
  lu_at           timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_msg_conv   ON public.support_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_msg_unread ON public.support_messages (conversation_id, lu_at) WHERE lu_at IS NULL;

-- =====================================================================
-- 3. TRIGGER — updated_at sur conversation quand un message arrive
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_conv_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE public.support_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_conv_touch ON public.support_messages;
CREATE TRIGGER trg_support_conv_touch
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_conv_touch_updated_at();

-- =====================================================================
-- 4. RLS
-- =====================================================================

-- Helper : true si l'user courant est admin (présence email dans admin_emails).
-- SECURITY DEFINER → contourne la RLS sur auth.users pour la lecture de l'email.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.admin_emails WHERE lower(email) = lower(v_email));
END;
$$;

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages      ENABLE ROW LEVEL SECURITY;

-- Conversations : le user voit les siennes ; les admins voient tout.
DROP POLICY IF EXISTS support_conv_select ON public.support_conversations;
CREATE POLICY support_conv_select ON public.support_conversations
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Messages : visibles aux membres de la conv (user) OU aux admins.
DROP POLICY IF EXISTS support_msg_select ON public.support_messages;
CREATE POLICY support_msg_select ON public.support_messages
  FOR SELECT
  USING (
    public.is_admin()
    OR conversation_id IN (
      SELECT id FROM public.support_conversations WHERE user_id = auth.uid()
    )
  );

-- Toutes les écritures passent par les API routes via supabaseAdmin (service role).
-- RLS bloque par défaut, le service role bypasse.

-- =====================================================================
-- 5. REALTIME
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- =====================================================================
-- 6. Étendre notifications.target_type pour 'support_conversation'
-- =====================================================================
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IS NULL OR target_type IN (
    'producer', 'event', 'etablissement', 'claim',
    'promotion', 'annonce', 'conversation', 'support_conversation'
  ));

-- =====================================================================
-- Vérifications post-execution :
--
--   -- Tables créées
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'support_%';
--
--   -- Realtime activé
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname='supabase_realtime' AND tablename='support_messages';
--
--   -- target_type étendu
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname='notifications_target_type_check';
-- =====================================================================
