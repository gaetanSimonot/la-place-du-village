-- ═══════════════════════════════════════════════════════════════════════
-- UNE NEUVIÈME CATÉGORIE : EXPOSITION
--
-- Pourquoi. Sur l'agenda de Pau, 60 événements sur 104 tombaient dans
-- « autre » — plus de la moitié. Ce n'étaient pas des cas tordus : c'étaient
-- des expositions, que nos huit catégories n'avaient pas. Une catégorie
-- fourre-tout qui pèse la moitié d'un agenda n'est plus une catégorie de
-- repli, c'est un trou.
--
-- Les visites et les conférences restent dans « autre » : elles ne se
-- confondent pas avec une exposition, et rien ne dit encore qu'elles
-- méritent chacune la leur. On ajoute ce qui manque, pas ce qui pourrait
-- manquer.
--
-- ⚠️ À JOUER AVANT DE DÉPLOYER. La colonne `categorie` porte une contrainte
-- CHECK : sans cette migration, tout événement classé « exposition » est
-- REFUSÉ par Postgres (erreur 23514). Le code sait retomber sur « autre »
-- dans ce cas, donc rien n'est perdu — mais rien n'est classé non plus.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

-- La contrainte porte un nom variable selon l'historique : on la retrouve.
DO $$
DECLARE
  nom_contrainte text;
BEGIN
  SELECT conname INTO nom_contrainte
    FROM pg_constraint
   WHERE conrelid = 'evenements'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%categorie%'
     AND pg_get_constraintdef(oid) ILIKE '%concert%'
   LIMIT 1;

  IF nom_contrainte IS NOT NULL THEN
    EXECUTE format('ALTER TABLE evenements DROP CONSTRAINT %I', nom_contrainte);
  END IF;
END $$;

ALTER TABLE evenements
  ADD CONSTRAINT evenements_categorie_check
  CHECK (categorie IN (
    'concert', 'theatre', 'sport', 'marche', 'atelier',
    'fete', 'sante_bien_etre', 'exposition', 'autre'
  ));

-- Le tableau `categories` suit la même liste, quand il est contraint.
DO $$
DECLARE
  nom_contrainte text;
BEGIN
  SELECT conname INTO nom_contrainte
    FROM pg_constraint
   WHERE conrelid = 'evenements'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%categories%'
   LIMIT 1;

  IF nom_contrainte IS NOT NULL THEN
    EXECUTE format('ALTER TABLE evenements DROP CONSTRAINT %I', nom_contrainte);
    EXECUTE $q$
      ALTER TABLE evenements
        ADD CONSTRAINT evenements_categories_check
        CHECK (categories IS NULL OR categories <@ ARRAY[
          'concert', 'theatre', 'sport', 'marche', 'atelier',
          'fete', 'sante_bien_etre', 'exposition', 'autre'
        ]::text[])
    $q$;
  END IF;
END $$;
