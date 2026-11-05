-- ═══════════════════════════════════════════════════════════════════════
-- « DANS NOS BOIS » — le guide des champignons
--
-- Une fiche par ESPÈCE, rattachée à un territoire : les champignons du Sud
-- Cévennes ne sont pas ceux de Pau, et un guide de terrain qui montre les
-- espèces d'une autre région induit en erreur. `territoire_id` null = toutes.
--
-- Lecture publique, écriture réservée au serveur (service role) : aucune
-- policy d'écriture, volontairement.
--
-- Les photos vivent dans le bucket public `champignons` (licences libres,
-- auteur et licence dans `photo_credit`).
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS champignons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territoire_id uuid REFERENCES territoires(id) ON DELETE SET NULL,
  nom           text NOT NULL,
  nom_latin     text NOT NULL,
  -- Du meilleur au pire. L'ordre compte : c'est celui des pastilles.
  statut        text NOT NULL CHECK (statut IN
                  ('excellent', 'bon', 'comestible', 'prudence', 'non', 'toxique', 'mortel')),
  milieux       text[] NOT NULL DEFAULT '{}',   -- feuillus | pins | prairie | bois
  couleurs      text[] NOT NULL DEFAULT '{}',   -- couleur du chapeau
  saison        text,
  reconnaitre   text[] NOT NULL DEFAULT '{}',
  -- [{ "nom": "...", "latin": "..." | null, "note": "..." }]
  sosies        jsonb NOT NULL DEFAULT '[]',
  cuisine       text,                           -- comestibles
  danger        text,                           -- toxiques et mortels
  photo_url     text,
  photo_credit  text,
  ordre         int NOT NULL DEFAULT 0,
  actif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (territoire_id, nom_latin)
);

CREATE INDEX IF NOT EXISTS champignons_territoire_idx ON champignons (territoire_id, ordre);

ALTER TABLE champignons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS champignons_lecture ON champignons;
CREATE POLICY champignons_lecture ON champignons FOR SELECT USING (actif);

-- Bucket des photos : public en lecture. Pas de policy d'INSERT : seul le
-- serveur y dépose (service role).
INSERT INTO storage.buckets (id, name, public)
VALUES ('champignons', 'champignons', true)
ON CONFLICT (id) DO NOTHING;
