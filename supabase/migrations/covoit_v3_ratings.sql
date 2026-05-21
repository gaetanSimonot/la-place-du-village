-- ============================================================================
-- COVOITURAGE V3 — Profil enrichi + Notation + Mode régulier
-- ============================================================================
-- Cette migration est idempotente (IF NOT EXISTS / CREATE OR REPLACE).
-- À lancer dans Supabase Dashboard → SQL Editor une seule fois.
--
-- Reversible (cf. fin de fichier pour le rollback).
--
-- Couvre :
--   1. Profils enrichis  : genre (optionnel), is_verified (flag)
--   2. Trajets terminés  : is_completed + completed_at (désactive le trajet
--                          de la liste publique + débloque la notation)
--   3. Mode régulier     : regulier, jours_semaine, sens, heure_arrivee,
--                          detour_minutes (Karos-like, Q3 option B)
--   4. Notation covoit   : table covoit_ratings (1 row par conv passager x trajet)
--   5. Vues agrégées     : note moyenne + nb avis + trajets effectués
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1) PROFILS — genre + is_verified
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS genre        TEXT
    CHECK (genre IS NULL OR genre IN ('homme', 'femme', 'autre')),
  ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.genre IS
  'Optionnel : homme | femme | autre. NULL = "Préfère ne pas dire".';
COMMENT ON COLUMN profiles.is_verified IS
  'Flag manuel admin. Pas de process de vérification automatique.';


-- ──────────────────────────────────────────────────────────────────────────
-- 2) TRAJETS — état terminé + mode régulier
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE covoiturages
  ADD COLUMN IF NOT EXISTS is_completed   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS regulier       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jours_semaine  TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sens           TEXT        NOT NULL DEFAULT 'aller'
    CHECK (sens IN ('aller', 'retour', 'aller_retour')),
  ADD COLUMN IF NOT EXISTS heure_arrivee  TEXT,
  ADD COLUMN IF NOT EXISTS detour_minutes SMALLINT    NOT NULL DEFAULT 0
    CHECK (detour_minutes >= 0 AND detour_minutes <= 60);

COMMENT ON COLUMN covoiturages.is_completed IS
  'Le conducteur a marqué le trajet comme effectué. Cache le trajet de la liste publique et débloque la notation par les passagers.';
COMMENT ON COLUMN covoiturages.regulier IS
  'Trajet récurrent (Karos-like). Si true, jours_semaine ne doit pas être vide.';
COMMENT ON COLUMN covoiturages.jours_semaine IS
  'Codes 2 lettres : lu, ma, me, je, ve, sa, di. Tableau vide pour trajet ponctuel.';

-- Index pour filtrer rapidement les trajets actifs non terminés
CREATE INDEX IF NOT EXISTS idx_covoiturages_active
  ON covoiturages (date_trajet)
  WHERE statut = 'actif' AND is_completed = false;


-- ──────────────────────────────────────────────────────────────────────────
-- 3) RATINGS COVOIT — note 1-5 du passager vers conducteur
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS covoit_ratings (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL UNIQUE
                               REFERENCES covoit_conversations(id) ON DELETE CASCADE,
  covoit_id       UUID         NOT NULL
                               REFERENCES covoiturages(id) ON DELETE CASCADE,
  passager_id     UUID         NOT NULL
                               REFERENCES auth.users(id) ON DELETE CASCADE,
  conducteur_id   UUID         NOT NULL
                               REFERENCES auth.users(id) ON DELETE CASCADE,
  note            INTEGER      NOT NULL CHECK (note BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index pour l'agrégation par conducteur (note moyenne)
CREATE INDEX IF NOT EXISTS idx_covoit_ratings_conducteur
  ON covoit_ratings (conducteur_id);

CREATE INDEX IF NOT EXISTS idx_covoit_ratings_passager
  ON covoit_ratings (passager_id);

ALTER TABLE covoit_ratings ENABLE ROW LEVEL SECURITY;

-- SELECT public : tout le monde lit les ratings (affichés sur le profil conducteur)
DROP POLICY IF EXISTS covoit_ratings_select_public ON covoit_ratings;
CREATE POLICY covoit_ratings_select_public
  ON covoit_ratings
  FOR SELECT
  USING (true);

-- Toutes les autres opérations passent par service_role via les API routes
-- (l'API /api/covoiturages/conversations/[convId]/rating fait les checks
-- métier : passager légitime, trajet terminé, pas déjà noté)
DROP POLICY IF EXISTS covoit_ratings_admin_all ON covoit_ratings;
CREATE POLICY covoit_ratings_admin_all
  ON covoit_ratings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE covoit_ratings IS
  'Notation 1-5 d''un passager vers un conducteur après un trajet terminé. UNIQUE par conversation.';


-- ──────────────────────────────────────────────────────────────────────────
-- 4) VUES AGRÉGÉES — stats conducteur
-- ──────────────────────────────────────────────────────────────────────────

-- Note moyenne + nb avis du conducteur (calculé à la volée, pas de cache)
CREATE OR REPLACE VIEW covoit_conducteur_stats
  WITH (security_invoker = true) AS
SELECT
  conducteur_id                  AS user_id,
  ROUND(AVG(note)::numeric, 1)   AS note_moyenne,
  COUNT(*)::INTEGER              AS nombre_avis
FROM covoit_ratings
GROUP BY conducteur_id;

COMMENT ON VIEW covoit_conducteur_stats IS
  'Note moyenne (1 décimale) + nb avis par conducteur. Calculé à la volée.';

-- Nombre de trajets réellement effectués (is_completed = true)
CREATE OR REPLACE VIEW covoit_conducteur_trajets
  WITH (security_invoker = true) AS
SELECT
  user_id,
  COUNT(*)::INTEGER AS trajets_effectues
FROM covoiturages
WHERE is_completed = true
GROUP BY user_id;

COMMENT ON VIEW covoit_conducteur_trajets IS
  'Nombre de trajets terminés par conducteur. is_completed = true.';


-- ──────────────────────────────────────────────────────────────────────────
-- 5) REALTIME — ajouter covoit_ratings à la publication
-- ──────────────────────────────────────────────────────────────────────────
-- Permet aux UI conducteur/passager d'être notifiées en live d'une nouvelle note.
-- Idempotent : ne fail pas si déjà dans la publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE covoit_ratings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;  -- publication n'existe pas (instance non-Supabase)
END$$;


-- ============================================================================
-- ROLLBACK (à exécuter manuellement si besoin)
-- ============================================================================
-- DROP VIEW IF EXISTS covoit_conducteur_trajets;
-- DROP VIEW IF EXISTS covoit_conducteur_stats;
-- DROP TABLE IF EXISTS covoit_ratings;
-- ALTER TABLE covoiturages
--   DROP COLUMN IF EXISTS is_completed,
--   DROP COLUMN IF EXISTS completed_at,
--   DROP COLUMN IF EXISTS regulier,
--   DROP COLUMN IF EXISTS jours_semaine,
--   DROP COLUMN IF EXISTS sens,
--   DROP COLUMN IF EXISTS heure_arrivee,
--   DROP COLUMN IF EXISTS detour_minutes;
-- DROP INDEX IF EXISTS idx_covoiturages_active;
-- ALTER TABLE profiles
--   DROP COLUMN IF EXISTS genre,
--   DROP COLUMN IF EXISTS is_verified;
