-- =====================================================================
-- embed_ref_id : uuid → text
-- Date : 2026-05-22
--
-- Contexte : la première migration (2026-05-22_embed_attachments.sql)
-- a typé embed_ref_id en uuid. Or les tables référençables n'ont pas
-- toutes des PK en uuid : promotions peut avoir un bigint, certaines
-- tables custom aussi. Pour rester flexible et accepter tous les IDs,
-- on passe la colonne en text.
--
-- Idempotent : si déjà text, ne fait rien. Si uuid, convertit.
-- =====================================================================

DO $$
BEGIN
  -- posts.embed_ref_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts'
      AND column_name = 'embed_ref_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.posts
      ALTER COLUMN embed_ref_id TYPE text USING embed_ref_id::text;
  END IF;

  -- messages.embed_ref_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'embed_ref_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.messages
      ALTER COLUMN embed_ref_id TYPE text USING embed_ref_id::text;
  END IF;
END $$;

-- Vérification :
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='embed_ref_id';
