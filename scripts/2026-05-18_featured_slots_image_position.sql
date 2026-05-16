-- =====================================================================
-- featured_slots : cadrage de l'image par slot (image_position)
-- Date : 2026-05-18
--
-- Permet à l'admin de choisir le recadrage de la vignette dans le hub
-- carousel sans modifier l'image source de l'entité (event/etab/producteur).
-- Format : "X% Y%" comme CSS object-position (ex: "50% 30%").
-- NULL = fallback "50% 50%" (centre).
-- =====================================================================

ALTER TABLE public.featured_slots
  ADD COLUMN IF NOT EXISTS image_position text;

COMMENT ON COLUMN public.featured_slots.image_position IS
  'CSS object-position pour cadrer l''image dans le carousel hub. Format "X% Y%". NULL = centre.';
