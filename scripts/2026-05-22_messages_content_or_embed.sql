-- =====================================================================
-- CHECK constraint messages : autorise content vide SI embed présent
-- Date : 2026-05-22
--
-- Contexte : le CHECK actuel rejette content = '' (string vide), ce qui
-- bloque l'envoi de messages qui contiennent UNIQUEMENT un embed
-- (partage de promo/annonce/event sans texte).
--
-- Nouveau CHECK : un message est valide si :
--   - il a du content non vide (cas normal texte)
--   OU
--   - il a un embed (embed_kind + embed_ref_id non null)
-- Sinon = message totalement vide → rejeté (ce qu'on veut).
--
-- Idempotent : DROP IF EXISTS puis ADD.
-- =====================================================================

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check
  CHECK (
    (content IS NOT NULL AND length(trim(content)) > 0)
    OR
    (embed_kind IS NOT NULL AND embed_ref_id IS NOT NULL)
  );

-- Vérification :
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid='public.messages'::regclass AND contype='c';
