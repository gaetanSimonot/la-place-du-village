-- ============================================================================
-- PROMOTIONS LOCALES — 2026-05-12
-- ============================================================================
-- Module promotions locales : un commerçant Pro/Max crée une promo
-- ("1 repas = 1 verre offert"), les users abonnés Pro cliquent "J'en profite",
-- le commerçant reçoit une notif + stats.
--
-- Confiance : pas de QR/code, le commerçant voit le nom du user et valide
-- visuellement (la personne est devant lui).
--
-- Fréquence d'utilisation par user :
--   - 'always'  : 1 fois maximum (toujours)
--   - 'weekly'  : 1 fois par semaine
--   - 'monthly' : 1 fois par mois
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  conditions TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('always', 'weekly', 'monthly')),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_etab    ON public.promotions(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active  ON public.promotions(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_promotions_valid   ON public.promotions(valid_until) WHERE valid_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.promotion_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_uses_promo  ON public.promotion_uses(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_user   ON public.promotion_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_recent ON public.promotion_uses(promotion_id, user_id, used_at DESC);

-- RLS promotions : tout le monde lit les promos actives, seul le créateur édite
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotions: public read active" ON public.promotions;
DROP POLICY IF EXISTS "promotions: owner manages"     ON public.promotions;

CREATE POLICY "promotions: public read active"
  ON public.promotions FOR SELECT
  USING (active = true);

CREATE POLICY "promotions: owner manages"
  ON public.promotions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS promotion_uses : user voit ses utilisations, créateur de la promo voit toutes ses utilisations
ALTER TABLE public.promotion_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uses: user reads own"     ON public.promotion_uses;
DROP POLICY IF EXISTS "uses: user inserts own"   ON public.promotion_uses;

CREATE POLICY "uses: user reads own"
  ON public.promotion_uses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "uses: user inserts own"
  ON public.promotion_uses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
