-- featured_slots : ajout de la notion de "position" pour le slot homepage+event
--
-- Contexte : sur la home, la section "Aujourd'hui" a 3 emplacements fixes
-- (1 grosse tuile + 2 mini). On veut que l'admin puisse choisir EXPLICITEMENT
-- quel event va à chaque position, plutôt que de gérer une priority libre.
-- Position 1 = grosse tuile. Position 2 et 3 = mini tuiles.
--
-- Cette colonne reste NULL pour les autres slots (splash, hub_hero) et pour
-- les autres content_types (annonce, promotion) sur homepage — ces cas
-- gardent le comportement priority libre.
--
-- Unicité : on ne peut pas définir un UNIQUE INDEX partiel avec now() (Postgres
-- requiert immutable). La vérification "pas 2 events à la même position
-- aujourd'hui" se fait côté API /api/featured-slots avant insert.

ALTER TABLE featured_slots
  ADD COLUMN IF NOT EXISTS position int
  CHECK (position IS NULL OR (position >= 1 AND position <= 3));

-- Index pour accélérer les lookups par position sur la home
CREATE INDEX IF NOT EXISTS featured_slots_homepage_event_position_idx
  ON featured_slots (slot, content_type, position)
  WHERE position IS NOT NULL;
