CREATE TABLE IF NOT EXISTS zone_centres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Insérer Ganges comme centre par défaut
INSERT INTO zone_centres (nom, lat, lng)
VALUES ('Ganges', 43.9333, 3.7)
ON CONFLICT DO NOTHING;

-- Ajouter rayon_km dans config (30 km par défaut)
INSERT INTO config (key, value)
VALUES ('rayon_km', '30')
ON CONFLICT (key) DO NOTHING;
