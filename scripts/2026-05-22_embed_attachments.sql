-- =====================================================================
-- Embed multi-source : posts.embed + messages.embed (chat friend)
-- Date : 2026-05-22
--
-- Permet d'attacher un élément de la DB (event, etab, producer, annonce,
-- promotion, covoit) à un post du mur ou à un message de chat.
-- Stockage léger : 2 colonnes (kind + ref_id) sans contrainte FK pour
-- éviter de bloquer la suppression de l'élément référencé (on rend
-- gracieusement "Élément supprimé" côté UI).
-- =====================================================================

-- posts.embed_kind + embed_ref_id
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS embed_kind text
    CHECK (embed_kind IS NULL OR embed_kind IN ('event','etab','producer','annonce','promo','covoit'));
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS embed_ref_id uuid;

-- messages.embed_kind + embed_ref_id (chat friend + autres conv)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS embed_kind text
    CHECK (embed_kind IS NULL OR embed_kind IN ('event','etab','producer','annonce','promo','covoit'));
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS embed_ref_id uuid;

-- Vérification :
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name IN ('posts','messages')
--   AND column_name IN ('embed_kind','embed_ref_id');
