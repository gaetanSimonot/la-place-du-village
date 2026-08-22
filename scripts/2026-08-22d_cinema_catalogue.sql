-- ═══════════════════════════════════════════════════════════════════════
-- MODULE CINÉMA — le catalogue est PAR SALLE
--
-- Les films restent GLOBAUX : deux salles qui jouent le même film partagent
-- une seule fiche, avec une seule affiche et un seul synopsis. C'est voulu.
--
-- Mais « Mes films » ne pouvait se déduire que de `films.cree_par` (qui a
-- saisi la fiche le premier) et des séances déjà programmées. Conséquence
-- vécue : la deuxième salle ajoute un film que la première avait entré, le
-- serveur répond « il existe déjà », et le film n'apparaît nulle part chez
-- elle — donc impossible à programmer. La relation manquait, on l'écrit.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cinema_films (
  etablissement_id uuid NOT NULL REFERENCES etablissements(id) ON DELETE CASCADE,
  film_id          uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (etablissement_id, film_id)
);
-- « quelles salles ont ce film ? » — posée à chaque suppression.
CREATE INDEX IF NOT EXISTS cinema_films_film_idx ON cinema_films (film_id);

-- ── Reprise de l'existant ──────────────────────────────────────────────
-- Le catalogue d'aujourd'hui, tel que le code le déduisait : le créateur de
-- la fiche, et toute salle qui programme le film.
INSERT INTO cinema_films (etablissement_id, film_id)
SELECT cree_par, id FROM films WHERE cree_par IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO cinema_films (etablissement_id, film_id)
SELECT DISTINCT etablissement_id, film_id FROM seances
ON CONFLICT DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────
-- Même règle que `seances` : lecture publique (l'expérience cinéma est sans
-- compte), écriture réservée au propriétaire de la fiche. L'admin de l'app
-- passe par le service role.
ALTER TABLE cinema_films ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cinema_films_select_public ON cinema_films;
CREATE POLICY cinema_films_select_public ON cinema_films FOR SELECT USING (true);

DROP POLICY IF EXISTS cinema_films_write_owner ON cinema_films;
CREATE POLICY cinema_films_write_owner ON cinema_films FOR ALL
  USING (EXISTS (
    SELECT 1 FROM etablissements e
    WHERE e.id = cinema_films.etablissement_id
      AND e.user_id = auth.uid()
      AND e.module_cinema = true
  ));
