-- Rappel personnalisable par événement mis en favori.
--
-- Jusqu'ici le rappel partait toujours la veille (valeur codée dans le cron).
-- Cette colonne permet à chacun de choisir, favori par favori : le jour même,
-- la veille, 2 ou 3 jours avant, ou une semaine avant.
--
-- DEFAULT 1 = la veille : le comportement existant est conservé pour les
-- favoris déjà en base, personne ne voit son réglage changer.
--
-- Rejouable sans risque.

ALTER TABLE event_favorites
  ADD COLUMN IF NOT EXISTS rappel_jours smallint NOT NULL DEFAULT 1;

-- Bornes : le cron ne regarde que les événements des 8 prochains jours.
ALTER TABLE event_favorites
  DROP CONSTRAINT IF EXISTS event_favorites_rappel_jours_check;
ALTER TABLE event_favorites
  ADD CONSTRAINT event_favorites_rappel_jours_check
  CHECK (rappel_jours >= 0 AND rappel_jours <= 7);
