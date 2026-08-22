-- Enrichissement des fiches films depuis TMDB.
--
-- TMDB sert à TROUVER et à préremplir un film. Notre table `films` reste la
-- source de vérité : les séances pointent `film_id`, jamais un identifiant
-- TMDB. Changer de fournisseur un jour ne toucherait aucune programmation.
--
-- Rejouable sans risque.

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS tmdb_id         integer,
  ADD COLUMN IF NOT EXISTS metadata_source text NOT NULL DEFAULT 'manuel',
  ADD COLUMN IF NOT EXISTS backdrop_url    text,
  ADD COLUMN IF NOT EXISTS date_sortie     date;

-- La déduplication repose dessus : deux cinémas qui programment le même film
-- doivent tomber sur la même fiche. Index partiel — les films saisis à la main
-- n'ont pas de tmdb_id et ne doivent pas se gêner entre eux.
CREATE UNIQUE INDEX IF NOT EXISTS films_tmdb_id_key
  ON films (tmdb_id) WHERE tmdb_id IS NOT NULL;

ALTER TABLE films
  DROP CONSTRAINT IF EXISTS films_metadata_source_check;
ALTER TABLE films
  ADD CONSTRAINT films_metadata_source_check
  CHECK (metadata_source IN ('manuel', 'tmdb'));

-- Second filet de déduplication, pour les films sans tmdb_id : le titre SEUL
-- ne suffit pas — « Dune » existe en 1984 et en 2021, et réutiliser l'un pour
-- l'autre transférerait la programmation au mauvais film.
CREATE UNIQUE INDEX IF NOT EXISTS films_titre_annee_key
  ON films (lower(titre), annee) WHERE tmdb_id IS NULL AND annee IS NOT NULL;
