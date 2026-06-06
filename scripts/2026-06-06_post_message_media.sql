-- Médias sur posts + messages — 2026-06-06
-- ============================================================================
-- Ajoute une colonne `media` (jsonb) pour stocker une liste d'attachements :
--   - photo  : { "t": "photo", "url": "https://.../storage/.../xxx.jpg" }
--   - youtube: { "t": "youtube", "id": "VIDEO_ID" }
--   - link   : { "t": "link", "url": "...", "title": "...", "description": "...", "image": "..." }
--
-- Additif et sans danger : colonne nullable, le code existant ne la lit pas.
-- À jouer AVANT de déployer le code qui l'utilise.
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media jsonb;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media jsonb;

-- Vérif (optionnel) :
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name IN ('posts','messages')
--     AND column_name = 'media';
