-- Spotlight journal : autorise un producteur en plus d'un établissement.
-- Le cron random reste sur etablissements ; l'admin peut maintenant choisir
-- librement via le picker UI.

ALTER TABLE journaux_hebdo
  ADD COLUMN IF NOT EXISTS spotlight_kind text DEFAULT 'etablissement'
    CHECK (spotlight_kind IN ('etablissement', 'producteur'));

-- Backfill : tout l'existant reste sur etablissement (default)
UPDATE journaux_hebdo
  SET spotlight_kind = 'etablissement'
  WHERE spotlight_kind IS NULL;
