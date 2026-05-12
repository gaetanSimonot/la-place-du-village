-- ============================================================================
-- ETABLISSEMENT_DRAFTS — système de modifs gestionnaire — 2026-05-12
-- ============================================================================
-- Architecture : etablissements = version OFFICIELLE publique. Les modifs
-- d'un user (gestionnaire) vivent dans etablissement_drafts. La version
-- officielle ne change pas sauf intervention admin. La fiche publique
-- merge le draft du propriétaire actuel SI ce dernier a un plan Pro/Max.
--
-- Bénéfices :
-- - Vandalisme : les modifs d'un malveillant disparaissent dès release
-- - Continuité : un user qui re-revendique retrouve ses modifs intactes
-- - Cancel Stripe : modifs disparaissent automatiquement de la fiche publique
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.etablissement_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (etablissement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_etab_drafts_user ON public.etablissement_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_etab_drafts_etab ON public.etablissement_drafts(etablissement_id);

-- RLS : seul le propriétaire du draft peut le lire/écrire, plus l'admin (via service role)
ALTER TABLE public.etablissement_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafts: user read own"   ON public.etablissement_drafts;
DROP POLICY IF EXISTS "drafts: user write own"  ON public.etablissement_drafts;
DROP POLICY IF EXISTS "drafts: user delete own" ON public.etablissement_drafts;

CREATE POLICY "drafts: user read own"
  ON public.etablissement_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "drafts: user write own"
  ON public.etablissement_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drafts: user update own"
  ON public.etablissement_drafts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drafts: user delete own"
  ON public.etablissement_drafts FOR DELETE
  USING (auth.uid() = user_id);
