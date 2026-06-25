-- ════════════════════════════════════════════════════════════════════════
-- Favoris sur les promotions (bouton cœur)
-- ════════════════════════════════════════════════════════════════════════
-- Table de liaison user ⨯ promotion. Écritures via service role (supabaseAdmin),
-- comme etablissement_favorites. RLS activé sans policy = accès direct client
-- bloqué (sécurité par défaut), les routes API passent par le service role.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.promotion_favorites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, promotion_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_favorites_user ON public.promotion_favorites(user_id);

ALTER TABLE public.promotion_favorites ENABLE ROW LEVEL SECURITY;
