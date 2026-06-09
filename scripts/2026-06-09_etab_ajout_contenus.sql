-- Ajout de contenus depuis la fiche établissement (partenaire local) — 2026-06-09
-- ============================================================================
-- 1. Rattache un événement à un établissement (events créés depuis la fiche).
-- 2. Table etablissement_posts : actus / autres publications (texte + photo)
--    postées par le propriétaire de la fiche, affichées dessus.
-- Lecture publique (RLS SELECT true) ; toutes les écritures passent par les
-- routes API en service_role (qui revérifient auth + ownership).
-- ============================================================================

-- ── 1. Lien événement → établissement ────────────────────────────────────────
-- SET NULL : si la fiche part, l'event reste sur l'app (juste détaché).
ALTER TABLE public.evenements
  ADD COLUMN IF NOT EXISTS etablissement_id uuid
  REFERENCES public.etablissements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_evenements_etablissement
  ON public.evenements (etablissement_id);

-- ── 2. Posts établissement (actu / autre) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.etablissement_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type             text NOT NULL DEFAULT 'actu' CHECK (type IN ('actu', 'autre')),
  titre            text CHECK (titre IS NULL OR char_length(titre) <= 120),
  contenu          text NOT NULL CHECK (char_length(contenu) BETWEEN 1 AND 2000),
  image_url        text,
  image_position   text NOT NULL DEFAULT '50% 50%',
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_etab_posts_fiche
  ON public.etablissement_posts (etablissement_id, active, created_at DESC);

-- ── RLS : lecture publique ; écritures = service_role (API) ───────────────────
ALTER TABLE public.etablissement_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etab_posts_read ON public.etablissement_posts;
CREATE POLICY etab_posts_read ON public.etablissement_posts FOR SELECT USING (true);
