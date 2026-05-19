-- Journal hebdo — table pour le journal du village publié chaque lundi.
-- Le contenu rédactionnel (cover, billet, saviez-vous) est généré par Claude
-- via un cron Vercel. Les "sélections" pointent vers des entités existantes.

CREATE TABLE IF NOT EXISTS journaux_hebdo (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                 int UNIQUE NOT NULL,
  date_parution          date NOT NULL,
  semaine_du             date NOT NULL,
  semaine_au             date NOT NULL,
  cover_kicker           text NOT NULL,
  cover_titre            text NOT NULL,
  cover_deck             text NOT NULL,
  cover_image_url        text,
  meteo                  jsonb,
  billet_titre           text,
  billet_corps           text,
  saviez_vous            text,
  selection_event_ids    uuid[] DEFAULT '{}',
  selection_annonce_ids  uuid[] DEFAULT '{}',
  selection_bonplan_ids  uuid[] DEFAULT '{}',
  temps_lecture_min      int DEFAULT 5,
  statut                 text DEFAULT 'publie' CHECK (statut IN ('brouillon', 'publie')),
  generated_at           timestamptz DEFAULT now(),
  publie_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journaux_hebdo_numero_idx ON journaux_hebdo (numero DESC);
CREATE INDEX IF NOT EXISTS journaux_hebdo_statut_idx ON journaux_hebdo (statut, numero DESC);

-- RLS : tout le monde peut lire les numéros publiés
ALTER TABLE journaux_hebdo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journaux_read_published ON journaux_hebdo;
CREATE POLICY journaux_read_published ON journaux_hebdo
  FOR SELECT
  USING (statut = 'publie');

-- Les écritures passent par supabaseAdmin (cron + admin UI)
DROP POLICY IF EXISTS journaux_write_service ON journaux_hebdo;
CREATE POLICY journaux_write_service ON journaux_hebdo
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
