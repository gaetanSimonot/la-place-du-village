-- ═══════════════════════════════════════════════════════════════════════
-- MODULE CINÉMA — fondations
--
-- Un cinéma reste une FICHE ÉTABLISSEMENT. On n'introduit aucune nouvelle
-- entité « cinéma » : trois conditions cumulatives ouvrent le module —
-- fiche revendiquée (user_id), abonnement Pro (plan = 'pro'), et ce drapeau
-- accordé à la main depuis l'admin.
--
-- ⚠️ Les SÉANCES ne sont volontairement PAS des `evenements`. Un cinéma
-- programme 40 séances par semaine : dans la table `evenements`, elles
-- rempliraient l'agenda, la carte, les tuiles « Aujourd'hui », le splash,
-- la newsletter ET l'hebdo généré le lundi. Les avant-premières et
-- ciné-débats, eux, restent des `evenements` reliés à la fiche.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. La fiche établissement porte le module ──────────────────────────
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS module_cinema boolean NOT NULL DEFAULT false;

-- Identifiant lisible pour les liens directs et les QR codes :
-- /cinema?cinema=ganges plutôt qu'un UUID.
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS etablissements_slug_key
  ON etablissements (slug) WHERE slug IS NOT NULL;

-- Billetterie externe du cinéma. Aucun paiement dans l'app.
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS billetterie_url text;

-- ── 2. Les films ───────────────────────────────────────────────────────
-- Volontairement GLOBAUX, pas rattachés à un cinéma : c'est ce qui permet
-- à deux salles de programmer le même film sans le recréer. `cree_par`
-- garde la trace de qui l'a saisi.
CREATE TABLE IF NOT EXISTS films (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre          text NOT NULL,
  titre_original text,
  annee          smallint,
  duree_min      smallint,
  realisateur    text,
  casting        text,
  genres         text[],
  synopsis       text,
  affiche_url    text,
  bande_annonce_url text,
  avertissement  text,
  cree_par       uuid REFERENCES etablissements(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS films_titre_idx ON films (lower(titre));

-- ── 3. Les séances ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES etablissements(id) ON DELETE CASCADE,
  film_id          uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  date             date NOT NULL,
  heure            time NOT NULL,
  version          text NOT NULL DEFAULT 'vf',   -- vf | vost | vo
  salle            text,
  billetterie_url  text,                          -- surcharge ponctuelle
  note             text,                          -- « séance ciné-club », etc.
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seances_version_check CHECK (version IN ('vf', 'vost', 'vo')),
  -- Deux fois la même séance n'a pas de sens, et l'import automatique peut
  -- relire deux fois le même programme : c'est Postgres qui tranche.
  CONSTRAINT seances_unique UNIQUE (etablissement_id, film_id, date, heure)
);
CREATE INDEX IF NOT EXISTS seances_etab_date_idx ON seances (etablissement_id, date);
CREATE INDEX IF NOT EXISTS seances_date_idx ON seances (date);

-- ── 4. Lien optionnel événement → film ─────────────────────────────────
-- Une avant-première reste un `evenement` (donc visible dans l'agenda du
-- village) mais peut afficher l'affiche du film.
ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS film_id uuid REFERENCES films(id) ON DELETE SET NULL;

-- ── 5. RLS ─────────────────────────────────────────────────────────────
-- Lecture publique (l'expérience cinéma est sans compte). Écriture réservée
-- au propriétaire de la fiche ; l'admin passe par le service role.
ALTER TABLE films   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS films_select_public ON films;
CREATE POLICY films_select_public ON films FOR SELECT USING (true);

DROP POLICY IF EXISTS seances_select_public ON seances;
CREATE POLICY seances_select_public ON seances FOR SELECT USING (true);

DROP POLICY IF EXISTS seances_write_owner ON seances;
CREATE POLICY seances_write_owner ON seances FOR ALL
  USING (EXISTS (
    SELECT 1 FROM etablissements e
    WHERE e.id = seances.etablissement_id
      AND e.user_id = auth.uid()
      AND e.module_cinema = true
  ));

DROP POLICY IF EXISTS films_write_cinema ON films;
CREATE POLICY films_write_cinema ON films FOR ALL
  USING (EXISTS (
    SELECT 1 FROM etablissements e
    WHERE e.user_id = auth.uid() AND e.module_cinema = true
  ));

-- ── 6. Le cinéma de Ganges, pour la mise au point ──────────────────────
-- Fiche réelle « Cinéma l'arc en ciel Cineode », déjà revendiquée et passée
-- en Pro. On lui accorde le module et son identifiant de lien.
UPDATE etablissements
   SET module_cinema  = true,
       slug           = COALESCE(slug, 'ganges'),
       billetterie_url = COALESCE(billetterie_url, 'https://www.cineode.fr/arc-en-ciel-ganges/')
 WHERE id = '936a319c-8e89-46ba-af27-5d04b928fcb9';
