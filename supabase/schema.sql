-- Table : lieux
CREATE TABLE IF NOT EXISTS lieux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  adresse TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  place_id_google TEXT,
  commune TEXT,
  code_postal TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table : evenements
CREATE TABLE IF NOT EXISTS evenements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre TEXT NOT NULL,
  description TEXT,
  date_debut DATE,
  date_fin DATE,
  heure TIME,
  categorie TEXT CHECK (categorie IN ('concert','theatre','sport','marche','atelier','fete','autre')),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('publie','en_attente','rejete')),
  lieu_id UUID REFERENCES lieux(id) ON DELETE SET NULL,
  prix TEXT,
  contact TEXT,
  organisateurs TEXT,
  image_url TEXT,
  source TEXT CHECK (source IN ('whatsapp','formulaire','admin')),
  score_confiance NUMERIC(3,2) CHECK (score_confiance >= 0 AND score_confiance <= 1),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_evenements_statut ON evenements(statut);
CREATE INDEX IF NOT EXISTS idx_evenements_date_debut ON evenements(date_debut);
CREATE INDEX IF NOT EXISTS idx_evenements_lieu_id ON evenements(lieu_id);
