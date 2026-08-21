-- « 2 h avant » remplace « le jour même » dans les choix de rappel.
--
-- Représenté par la valeur sentinelle -1 dans rappel_jours : c'est le seul
-- réglage qui ne s'exprime pas en jours. Les valeurs >= 0 gardent leur sens
-- (nombre de jours avant l'événement).
--
-- Les favoris déjà réglés sur 0 (« le jour même ») basculent sur -1 : c'est
-- l'intention la plus proche, et l'option 0 disparaît de l'interface.
--
-- Rejouable sans risque.

ALTER TABLE event_favorites
  DROP CONSTRAINT IF EXISTS event_favorites_rappel_jours_check;
ALTER TABLE event_favorites
  ADD CONSTRAINT event_favorites_rappel_jours_check
  CHECK (rappel_jours >= -1 AND rappel_jours <= 7);

UPDATE event_favorites SET rappel_jours = -1 WHERE rappel_jours = 0;
