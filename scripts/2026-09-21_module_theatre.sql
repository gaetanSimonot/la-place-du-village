-- ═══════════════════════════════════════════════════════════════════════
-- MODULE THÉÂTRE — fondations
--
-- Calqué sur le module cinéma, et pour les mêmes raisons.
--
-- Un théâtre reste une FICHE ÉTABLISSEMENT. On n'introduit aucune entité
-- « théâtre » : les mêmes trois conditions cumulatives ouvrent le module —
-- fiche revendiquée (user_id), abonnement Pro (plan = 'pro'), et ce drapeau
-- accordé à la main depuis l'admin.
--
-- ⚠️ Les REPRÉSENTATIONS ne sont volontairement PAS des `evenements`, comme
-- les séances de cinéma n'en sont pas. Une saison, c'est une centaine de
-- dates en comptant les séances scolaires : dans `evenements`, elles
-- rempliraient l'agenda, la carte, les tuiles « Aujourd'hui », le splash,
-- la newsletter et l'hebdo du lundi. Un festival ou une soirée exception-
-- nelle, eux, restent des `evenements` reliés à la fiche.
--
-- Le MODULE vaut pour tous les territoires. C'est le théâtre Albarède qui
-- est à Ganges, pas le module.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. La fiche établissement porte le module ──────────────────────────
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS module_theatre boolean NOT NULL DEFAULT false;

-- `slug` et `billetterie_url` existent déjà depuis le module cinéma : une
-- fiche ne peut de toute façon porter qu'un seul de ces deux métiers.

-- ── 2. Les spectacles ──────────────────────────────────────────────────
-- Volontairement GLOBAUX, comme les films : une compagnie tourne, et deux
-- salles doivent pouvoir programmer le même spectacle sans le ressaisir.
-- `cree_par` garde la trace de qui l'a apporté.
CREATE TABLE IF NOT EXISTS spectacles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre          text NOT NULL,
  compagnie      text,
  -- « Théâtre d'objets », « Cirque théâtre d'objet », « Danse hip hop »…
  -- Le vocabulaire du spectacle vivant est trop riche pour une liste fermée :
  -- on garde le mot de la compagnie, tel qu'elle l'écrit.
  genre          text,
  duree_min      smallint,
  -- « Tout public à partir de 7 ans », « Maternelle »…
  public_conseille text,
  distribution   text,
  synopsis       text,
  citation       text,          -- l'extrait de presse mis en avant
  affiche_url    text,
  bande_annonce_url text,
  cree_par       uuid REFERENCES etablissements(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spectacles_titre_idx ON spectacles (lower(titre));

-- ── 3. Les représentations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS representations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES etablissements(id) ON DELETE CASCADE,
  spectacle_id     uuid NOT NULL REFERENCES spectacles(id) ON DELETE CASCADE,
  date             date NOT NULL,
  heure            time,
  /*
   * OÙ ÇA SE JOUE, quand ce n'est pas dans les murs.
   *
   * Un cinéma projette toujours chez lui ; un théâtre de village joue au
   * théâtre de verdure de Montoulieu, aux Belvédères de Blandas, dans les
   * classes, au Corum de Montpellier. Sans ce champ, la moitié d'une saison
   * rurale serait affichée au mauvais endroit.
   */
  lieu             text,
  /*
   * Une représentation scolaire n'est pas ouverte au public : elle doit
   * figurer au programme — le théâtre en est fier, et les parents le
   * demandent — mais jamais comme une séance à laquelle on peut venir.
   */
  scolaire         boolean NOT NULL DEFAULT false,
  billetterie_url  text,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Deux fois la même représentation n'a pas de sens, et un réimport doit
  -- pouvoir être rejoué : c'est Postgres qui tranche.
  CONSTRAINT representations_unique UNIQUE (etablissement_id, spectacle_id, date, heure)
);
CREATE INDEX IF NOT EXISTS representations_etab_date_idx
  ON representations (etablissement_id, date);
CREATE INDEX IF NOT EXISTS representations_date_idx ON representations (date);

-- ── 4. Lien optionnel événement → spectacle ────────────────────────────
-- Une soirée d'ouverture de saison reste un `evenement` (donc visible dans
-- l'agenda du village) mais peut afficher le visuel du spectacle.
ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS spectacle_id uuid REFERENCES spectacles(id) ON DELETE SET NULL;

-- ── 5. RLS ─────────────────────────────────────────────────────────────
-- Lecture publique (l'expérience théâtre est sans compte, comme le cinéma).
-- Écriture réservée au propriétaire de la fiche ; l'admin passe par le
-- service role, qui contourne RLS.
ALTER TABLE spectacles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE representations ENABLE ROW LEVEL SECURITY;

-- DROP d'abord : CREATE POLICY n'est pas idempotent, rejouer cette migration
-- échouerait sinon sur « already exists ».
DROP POLICY IF EXISTS spectacles_select_public ON spectacles;
CREATE POLICY spectacles_select_public ON spectacles FOR SELECT USING (true);

DROP POLICY IF EXISTS representations_select_public ON representations;
CREATE POLICY representations_select_public ON representations FOR SELECT USING (true);

DROP POLICY IF EXISTS representations_write_owner ON representations;
CREATE POLICY representations_write_owner ON representations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM etablissements e
    WHERE e.id = representations.etablissement_id
      AND e.user_id = auth.uid()
      AND e.module_theatre = true
  ));

DROP POLICY IF EXISTS spectacles_write_owner ON spectacles;
CREATE POLICY spectacles_write_owner ON spectacles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM etablissements e
    WHERE e.user_id = auth.uid()
      AND e.module_theatre = true
  ));
