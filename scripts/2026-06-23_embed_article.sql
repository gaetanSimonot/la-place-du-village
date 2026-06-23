-- ════════════════════════════════════════════════════════════════════════
-- Embed « article du Journal » dans les posts (mur) et messages (chat)
-- ════════════════════════════════════════════════════════════════════════
-- Étend la contrainte CHECK de embed_kind pour autoriser 'article' (en plus de
-- event/etab/producer/annonce/promo/covoit). Sans ça, attacher un article à un
-- post/message est rejeté à l'INSERT. Rejouable (DROP IF EXISTS avant ADD).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_embed_kind_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_embed_kind_check
  CHECK (embed_kind IS NULL OR embed_kind IN ('event','etab','producer','annonce','promo','covoit','article'));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_embed_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_embed_kind_check
  CHECK (embed_kind IS NULL OR embed_kind IN ('event','etab','producer','annonce','promo','covoit','article'));
