-- =====================================================================
-- Suppression user — TOUTES les FK auth.users passent en SET NULL
-- (sauf profiles qui reste CASCADE — le profil part avec le user)
-- Date : 2026-05-22
--
-- Contexte
-- --------
-- Quand un user supprime son compte (ou est supprimé par admin), on veut
-- préserver son contenu pour les autres : annonces achetées peuvent rester
-- visibles, posts vus par d'autres restent, messages dans les fils chat
-- restent (anonymisés "Utilisateur supprimé" côté UI), etc.
--
-- Comportement par catégorie :
-- - profiles            → CASCADE (le profile s'efface avec le user)
-- - PK composite (user dans la PK : post_likes, conversation_members, etc.)
--                       → CASCADE forcé (impossible de mettre NULL dans une PK)
-- - Tout le reste       → SET NULL (anonymisation)
--
-- Idempotent : ne touche que les FK actuellement en CASCADE. Les FK déjà
-- en SET NULL (etablissements après migration précédente) sont laissées.
-- =====================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass::text  AS table_name,
      c.conname                   AS constraint_name,
      a.attname                   AS column_name,
      a.attnotnull                AS is_not_null,
      EXISTS (
        SELECT 1 FROM pg_constraint pk
        WHERE pk.contype = 'p'
          AND pk.conrelid = c.conrelid
          AND a.attnum = ANY (pk.conkey)
      ) AS is_in_pk
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
      AND a.attnum  = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype = 'c'                              -- actuellement CASCADE
      AND c.conrelid::regclass::text NOT LIKE 'auth.%'
      AND c.conrelid::regclass::text NOT LIKE 'storage.%'
      AND c.conrelid::regclass::text != 'public.profiles'  -- profile garde CASCADE
  LOOP
    -- Skip les colonnes faisant partie d'une PK (impossible de SET NULL)
    IF r.is_in_pk THEN
      RAISE NOTICE 'SKIP % colonne PK %.%', r.table_name, r.table_name, r.column_name;
      CONTINUE;
    END IF;

    -- DROP NOT NULL si nécessaire (pour permettre SET NULL)
    IF r.is_not_null THEN
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
    END IF;

    -- Reconstitue la FK avec SET NULL
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.table_name, r.constraint_name, r.column_name
    );
    RAISE NOTICE 'CHANGED %.% to SET NULL', r.table_name, r.column_name;
  END LOOP;
END $$;

-- Vérification :
--   SELECT
--     conrelid::regclass AS table_name,
--     conname            AS constraint_name,
--     CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' END AS on_delete
--   FROM pg_constraint
--   WHERE confrelid = 'auth.users'::regclass AND contype = 'f'
--   ORDER BY conrelid::regclass::text;
