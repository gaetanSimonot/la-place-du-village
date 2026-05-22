-- =====================================================================
-- Etablissements — FK user_id passe en ON DELETE SET NULL
-- Date : 2026-05-22
--
-- Contexte
-- --------
-- Un établissement représente une infrastructure du village (commerce,
-- restaurant, association, etc.). Quand le gestionnaire supprime son
-- compte, l'établissement ne doit PAS être supprimé : il devient
-- simplement "déclaimé" (`user_id = NULL`) et pourra être revendiqué
-- plus tard par un nouveau gestionnaire.
--
-- Comportement avant migration : ON DELETE CASCADE (l'établissement
-- disparaissait quand le user était supprimé via admin ou auto).
-- Comportement après migration : ON DELETE SET NULL (la fiche reste,
-- juste sans gestionnaire).
--
-- Pour les autres tables (annonces, posts, producers, friendships,
-- post_likes, post_comments, notifications), on garde CASCADE — c'est
-- du contenu perso qui doit partir avec le compte.
-- =====================================================================

-- Recherche du nom exact de la contrainte FK (convention Supabase :
-- <table>_<col>_fkey, mais peut varier si renommée).
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.etablissements'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.etablissements'::regclass
        AND attname = 'user_id'
    );

  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.etablissements DROP CONSTRAINT ' || quote_ident(fk_name);
  END IF;

  ALTER TABLE public.etablissements
    ADD CONSTRAINT etablissements_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;
END $$;

-- Vérification :
--   SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid = 'public.etablissements'::regclass AND contype = 'f'
--     AND conname LIKE '%user_id%';
--   -- confdeltype doit être 'n' (= SET NULL). 'c' serait CASCADE.
