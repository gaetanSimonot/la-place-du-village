-- =====================================================================
-- Système de visibilité / mise en avant — La Place du Village
-- Date : 2026-05-17
--
-- 3 tables :
--  1. featured_slots      : ce qui est mis en avant, où, et quand
--  2. feature_credits     : crédits inclus dans l'abonnement pro (3/mois)
--  3. boost_purchases     : achats one-shot Stripe (boost payant)
--
-- Slots (4) :
--   - splash       : écran d'accueil avant l'app
--   - hub_hero     : carousel grosse card en haut du hub (events + établissements)
--   - a_la_une     : carousel "À la une" (commerces / pros)
--   - homepage     : injection dans tuiles de la home (promos & annonces)
--
-- Architecture override + fallback :
--   featured_slots = override admin/pro/boost
--   Si aucun slot actif → le hub retombe sur la logique d'auto-fill habituelle
-- =====================================================================

-- =====================================================================
-- 1. FEATURED_SLOTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.featured_slots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot              text NOT NULL CHECK (slot IN ('splash', 'hub_hero', 'a_la_une', 'homepage')),
  content_type      text NOT NULL CHECK (content_type IN ('evenement', 'etablissement', 'producteur', 'annonce', 'promotion')),
  content_id        uuid NOT NULL,
  starts_at         timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz NOT NULL,
  priority          int NOT NULL DEFAULT 0,
  sponsored         boolean NOT NULL DEFAULT false,
  source            text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'pro_credit', 'boost_purchase', 'editorial')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_admin  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT featured_slots_dates CHECK (ends_at > starts_at)
);

-- Index pour requêtes de lecture par slot avec filtre dates (pas de WHERE clause
-- car now() n'est pas IMMUTABLE et donc interdit dans un index partiel).
CREATE INDEX IF NOT EXISTS idx_featured_slots_lookup
  ON public.featured_slots (slot, ends_at DESC, starts_at);

CREATE INDEX IF NOT EXISTS idx_featured_slots_content
  ON public.featured_slots (content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_featured_slots_priority
  ON public.featured_slots (slot, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_featured_slots_created_by
  ON public.featured_slots (created_by) WHERE created_by IS NOT NULL;

COMMENT ON COLUMN public.featured_slots.slot IS 'splash | hub_hero | a_la_une | homepage';
COMMENT ON COLUMN public.featured_slots.content_type IS 'evenement | etablissement | producteur | annonce | promotion';
COMMENT ON COLUMN public.featured_slots.source IS 'admin (mise en avant éditoriale) | pro_credit (crédit inclus du plan) | boost_purchase (achat Stripe one-shot) | editorial (réservé futur)';

-- RLS : lecture publique des slots actifs, écritures via service role
ALTER TABLE public.featured_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS featured_slots_select ON public.featured_slots;
CREATE POLICY featured_slots_select ON public.featured_slots
  FOR SELECT USING (true);

-- =====================================================================
-- 2. FEATURE_CREDITS — crédits mensuels inclus dans l'abonnement
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.feature_credits (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  slots_total    int  NOT NULL DEFAULT 0,
  slots_used     int  NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fc_period CHECK (period_end > period_start),
  CONSTRAINT fc_used_le_total CHECK (slots_used <= slots_total)
);

CREATE INDEX IF NOT EXISTS idx_feature_credits_period
  ON public.feature_credits (period_start, period_end);

ALTER TABLE public.feature_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_credits_select_own ON public.feature_credits;
CREATE POLICY feature_credits_select_own ON public.feature_credits
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- =====================================================================
-- 3. BOOST_PURCHASES — achats Stripe one-shot
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.boost_purchases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_session_id   text UNIQUE,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  slot                text NOT NULL CHECK (slot IN ('splash', 'hub_hero', 'a_la_une', 'homepage')),
  duration_hours      int  NOT NULL CHECK (duration_hours > 0),
  content_type        text NOT NULL CHECK (content_type IN ('evenement', 'etablissement', 'producteur', 'annonce', 'promotion')),
  content_id          uuid NOT NULL,
  offer_key           text NOT NULL,
  amount_cents        int  NOT NULL,
  featured_slot_id    uuid REFERENCES public.featured_slots(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_boost_purchases_user   ON public.boost_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_boost_purchases_status ON public.boost_purchases (status);

ALTER TABLE public.boost_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boost_purchases_select_own ON public.boost_purchases;
CREATE POLICY boost_purchases_select_own ON public.boost_purchases
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- =====================================================================
-- 4. HELPER — calcule la période du mois en cours
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_credit_period()
RETURNS TABLE(period_start date, period_end date)
LANGUAGE sql STABLE
AS $$
  SELECT
    date_trunc('month', now())::date AS period_start,
    (date_trunc('month', now()) + interval '1 month')::date AS period_end
$$;

-- =====================================================================
-- 5. MIGRATION des vedette_hub existants → featured_slots
-- =====================================================================

-- Events vedette_hub → hub_hero (durée indéfinie = 1 an glissant)
INSERT INTO public.featured_slots (slot, content_type, content_id, ends_at, source, created_by_admin, priority)
SELECT
  'hub_hero',
  'evenement',
  id,
  now() + interval '365 days',
  'admin',
  true,
  10
FROM public.evenements
WHERE vedette_hub = true
ON CONFLICT DO NOTHING;

-- Annonces vedette_hub → homepage (les annonces vedette s'affichent dans la home)
INSERT INTO public.featured_slots (slot, content_type, content_id, ends_at, source, created_by_admin, priority)
SELECT
  'homepage',
  'annonce',
  id,
  now() + interval '365 days',
  'admin',
  true,
  10
FROM public.annonces
WHERE vedette_hub = true
ON CONFLICT DO NOTHING;

-- DROP des colonnes vedette_hub (la lecture passe désormais par featured_slots)
ALTER TABLE public.evenements DROP COLUMN IF EXISTS vedette_hub;
ALTER TABLE public.annonces   DROP COLUMN IF EXISTS vedette_hub;

-- =====================================================================
-- 6. CRON — reset mensuel des crédits pro
-- =====================================================================
-- Le 1er de chaque mois à 02:00 : on remet les compteurs des pros à zéro
-- en réinitialisant period_start / period_end / slots_used.
-- slots_total est recalculé depuis le plan courant (3 pour 'pro', 0 sinon).

CREATE OR REPLACE FUNCTION public.feature_credits_monthly_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start date := date_trunc('month', now())::date;
  v_end   date := (date_trunc('month', now()) + interval '1 month')::date;
BEGIN
  -- Upsert pour tous les pros (3 crédits)
  INSERT INTO public.feature_credits (user_id, period_start, period_end, slots_total, slots_used)
  SELECT p.user_id, v_start, v_end, 3, 0
  FROM public.profiles p
  WHERE p.plan = 'pro'
  ON CONFLICT (user_id) DO UPDATE
    SET period_start = v_start,
        period_end   = v_end,
        slots_total  = 3,
        slots_used   = 0,
        updated_at   = now();

  -- Pour les ex-pros (basic/habitants), on remet à 0 (et period reset)
  UPDATE public.feature_credits
  SET slots_total = 0,
      slots_used  = 0,
      period_start = v_start,
      period_end   = v_end,
      updated_at   = now()
  WHERE user_id IN (SELECT user_id FROM public.profiles WHERE plan != 'pro');
END;
$$;

-- Exécution mensuelle (pg_cron)
SELECT cron.schedule(
  'feature_credits_monthly_reset',
  '0 2 1 * *',  -- le 1er du mois à 02:00 UTC
  $$SELECT public.feature_credits_monthly_reset();$$
);

-- Initialisation immédiate de la période courante (premier passage)
SELECT public.feature_credits_monthly_reset();

-- =====================================================================
-- 7. REALTIME (optionnel — pour live update du Hub si un slot change)
-- =====================================================================
-- Activé pour featured_slots → si admin pin/unpin, le hub se met à jour live
ALTER PUBLICATION supabase_realtime ADD TABLE public.featured_slots;

-- =====================================================================
-- Vérifications post-execution :
--
--   -- Tables créées
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN ('featured_slots', 'feature_credits', 'boost_purchases');
--
--   -- Migration vedette_hub
--   SELECT slot, content_type, COUNT(*) FROM public.featured_slots
--   WHERE created_by_admin = true GROUP BY slot, content_type;
--
--   -- Colonnes vedette_hub bien droppées
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('evenements','annonces') AND column_name = 'vedette_hub';
--   -- (doit retourner 0 ligne)
--
--   -- Crédits pros initialisés
--   SELECT COUNT(*) FROM public.feature_credits WHERE slots_total = 3;
--
--   -- Cron planifié
--   SELECT jobname, schedule FROM cron.job WHERE jobname='feature_credits_monthly_reset';
-- =====================================================================
