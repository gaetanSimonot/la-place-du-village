-- ════════════════════════════════════════════════════════════════════════
-- Embed « débat de la Place publique » dans les posts (mur) et messages (chat)
-- ════════════════════════════════════════════════════════════════════════
-- Étend la contrainte CHECK de embed_kind pour autoriser 'debat' (en plus de
-- event/etab/producer/annonce/promo/covoit/article). Sans ça, joindre un débat
-- à une publication ou à un message est rejeté à l'INSERT — avec le message
-- « new row violates check constraint », qui ne dit pas quel type manque.
--
-- Le code accepte 'debat' depuis le commit 679d098 : cette migration est ce
-- qui manquait pour que la base soit d'accord.
--
-- Rejouable (DROP IF EXISTS avant ADD).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_embed_kind_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_embed_kind_check
  CHECK (embed_kind IS NULL OR embed_kind IN ('event','etab','producer','annonce','promo','covoit','article','debat'));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_embed_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_embed_kind_check
  CHECK (embed_kind IS NULL OR embed_kind IN ('event','etab','producer','annonce','promo','covoit','article','debat'));
