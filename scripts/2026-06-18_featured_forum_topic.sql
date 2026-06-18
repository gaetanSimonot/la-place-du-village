-- ════════════════════════════════════════════════════════════════════════
-- Mise en avant des sujets du forum (Place publique) dans le carrousel hub
-- ════════════════════════════════════════════════════════════════════════
-- Étend la contrainte CHECK de featured_slots.content_type pour autoriser
-- 'forum_topic'. Permet à l'admin de mettre un sujet en avant via le bouton
-- "⭐ Avant" (slot hub_hero), comme pour les événements.
-- Rejouable (DROP IF EXISTS avant re-ADD).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.featured_slots
  DROP CONSTRAINT IF EXISTS featured_slots_content_type_check;

ALTER TABLE public.featured_slots
  ADD CONSTRAINT featured_slots_content_type_check
  CHECK (content_type IN ('evenement','etablissement','producteur','annonce','promotion','forum_topic'));
