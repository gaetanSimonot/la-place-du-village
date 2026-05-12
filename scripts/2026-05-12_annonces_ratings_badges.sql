-- =====================================================================
-- Notes vendeur + badges au niveau de l'annonce — 2026-05-12
--
-- Workflow notes :
--   1. Le vendeur clôt la vente depuis le chat
--   2. L'acheteur reçoit une notif `annonce_vente_close` + un bouton
--      "Noter le vendeur" apparaît dans le chat
--   3. L'acheteur poste 1-5 étoiles + commentaire (optionnel)
--   4. UNIQUE par conv : pas de double rating
--
-- Workflow badges :
--   Chaque annonce porte ses propres flags `remise_main_propre` (bool)
--   et `garantie_jours` (int). Le vendeur coche/saisit à la création.
--   Affichés sur la fiche annonce si activés.
-- =====================================================================

-- =====================================================================
-- 1. ÉTENDRE annonces : badges au niveau de l'annonce
-- =====================================================================
ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS remise_main_propre boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantie_jours      integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.annonces.remise_main_propre IS 'Le vendeur propose la remise en main propre (badge sur fiche)';
COMMENT ON COLUMN public.annonces.garantie_jours     IS 'Nombre de jours de garantie (0 = pas de garantie). Badge sur fiche si > 0.';

-- =====================================================================
-- 2. RATINGS — notes après cloture
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.annonces_conversations(id) ON DELETE CASCADE,
  annonce_id      uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  acheteur_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendeur_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note            integer NOT NULL,                                              -- validation 1-5 côté API (CHECK silencieux évité)
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.annonces_ratings.note IS 'Note 1-5. Validation côté API (pas de CHECK constraint, cf feedback_postgres_check_constraints).';

CREATE INDEX IF NOT EXISTS idx_ratings_vendeur     ON public.annonces_ratings (vendeur_id);
CREATE INDEX IF NOT EXISTS idx_ratings_annonce     ON public.annonces_ratings (annonce_id);
CREATE INDEX IF NOT EXISTS idx_ratings_acheteur    ON public.annonces_ratings (acheteur_id);

-- =====================================================================
-- 3. VUE stats vendeur (calcul à la volée, pas de cache)
-- =====================================================================
CREATE OR REPLACE VIEW public.vendeur_stats AS
SELECT
  vendeur_id           AS user_id,
  ROUND(AVG(note)::numeric, 1) AS note_moyenne,
  COUNT(*)::integer    AS notes_count
FROM public.annonces_ratings
GROUP BY vendeur_id;

-- =====================================================================
-- 4. RLS — ratings lisibles publiquement, écritures via supabaseAdmin
-- =====================================================================
ALTER TABLE public.annonces_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ratings_select_public ON public.annonces_ratings;
CREATE POLICY ratings_select_public ON public.annonces_ratings
  FOR SELECT USING (true);

-- =====================================================================
-- 5. REALTIME — pour que la note apparaisse instantanément dans le chat
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.annonces_ratings;
