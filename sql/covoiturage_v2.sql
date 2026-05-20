-- ============================================================================
-- COVOITURAGE — addendum v2
-- À exécuter EN PLUS de sql/covoiturage.sql (idempotent).
--
-- - Ajoute la colonne `vehicule` (marque/modèle, optionnel) sur covoiturages
-- - Crée la table `covoit_favoris` (intérêt déclaré, comme un "save for later")
-- ============================================================================

-- 1. Vehicule ────────────────────────────────────────────────────────────────
ALTER TABLE covoiturages
  ADD COLUMN IF NOT EXISTS vehicule text;

-- 2. Favoris ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS covoit_favoris (
  user_id    uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  covoit_id  uuid NOT NULL REFERENCES covoiturages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, covoit_id)
);

CREATE INDEX IF NOT EXISTS idx_covoit_fav_user   ON covoit_favoris (user_id);
CREATE INDEX IF NOT EXISTS idx_covoit_fav_covoit ON covoit_favoris (covoit_id);

ALTER TABLE covoit_favoris ENABLE ROW LEVEL SECURITY;

-- Le user lit/écrit uniquement ses propres favoris ; service_role bypass.
DROP POLICY IF EXISTS covoit_fav_own ON covoit_favoris;
CREATE POLICY covoit_fav_own ON covoit_favoris
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS covoit_fav_admin_all ON covoit_favoris;
CREATE POLICY covoit_fav_admin_all ON covoit_favoris
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
