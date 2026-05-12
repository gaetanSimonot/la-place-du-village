-- =====================================================================
-- Mise en vedette dans le hub d'accueil — 2026-05-12
--
-- L'admin coche `vedette_hub` sur un événement ou une annonce pour
-- l'afficher dans le hero / la section vedette du hub.
--
-- Affichage hub :
--  - Événement vedette : cascade admin_pin > du jour > de la semaine > random
--  - Annonce vedette : admin_pin (1 seule à la fois → unique partiel index)
-- =====================================================================

ALTER TABLE public.evenements
  ADD COLUMN IF NOT EXISTS vedette_hub boolean NOT NULL DEFAULT false;

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS vedette_hub boolean NOT NULL DEFAULT false;

-- Index partiels : utiles pour les queries "WHERE vedette_hub = true"
CREATE INDEX IF NOT EXISTS idx_evenements_vedette_hub ON public.evenements (vedette_hub) WHERE vedette_hub = true;
CREATE INDEX IF NOT EXISTS idx_annonces_vedette_hub   ON public.annonces   (vedette_hub) WHERE vedette_hub = true;

COMMENT ON COLUMN public.evenements.vedette_hub IS 'Admin pin : affiché en hero du hub';
COMMENT ON COLUMN public.annonces.vedette_hub   IS 'Admin pin : affiché en section "Les prix baissent" / "Annonces vedette" du hub';
