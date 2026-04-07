-- ── Table sources ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  actif       BOOLEAN     NOT NULL DEFAULT true,
  frequence   TEXT        NOT NULL DEFAULT '24h',   -- '24h' | '12h' | '48h'
  dernier_scrape TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table scrape_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID        REFERENCES sources(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  trouves     INTEGER     NOT NULL DEFAULT 0,
  doublons    INTEGER     NOT NULL DEFAULT 0,
  inseres     INTEGER     NOT NULL DEFAULT 0,
  erreur      TEXT
);

-- ── Colonne scrape_source_id sur evenements ───────────────────────────────────
ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS scrape_source_id UUID REFERENCES sources(id) ON DELETE SET NULL;

-- ── Index utiles ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sources_actif        ON sources(actif);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_source   ON scrape_logs(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evenements_scrape    ON evenements(source, scrape_source_id);
