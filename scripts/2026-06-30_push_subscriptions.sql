-- ============================================================================
-- WEB PUSH — table des abonnements push (un par appareil/navigateur) — 2026-06-30
-- ============================================================================
-- Stocke les PushSubscription (endpoint + clés) pour envoyer des notifications
-- web push (Android/TWA, desktop, iOS PWA 16.4+). Un user peut avoir plusieurs
-- abonnements (téléphone + ordi). `endpoint` est unique → upsert par appareil.
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- L'écriture passe par les routes API en service_role (bypass RLS), mais on
-- pose quand même des policies propres : chacun ne voit/gère que ses abonnements.
DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- Vérification :
--   SELECT * FROM public.push_subscriptions;
-- ============================================================================
