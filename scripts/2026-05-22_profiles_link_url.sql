-- =====================================================================
-- Profils — ajout d'une colonne link_url (URL libre, optionnelle)
-- Date : 2026-05-22
--
-- Contexte
-- --------
-- Refonte EditProfileModal V3 (PR 1 commit 4). Le mockup ajoute un champ
-- "Lien" qui permet à un utilisateur d'afficher une URL sur sa fiche
-- (site perso, portfolio, blog, etc.).
--
-- On stocke comme text NULL. La validation https:// + longueur 500 max est
-- faite côté API /api/profile (route PATCH) avant l'insert, pas en CHECK
-- constraint — pour pouvoir évoluer sans migration et garder une chaîne
-- vide convertie en NULL sans friction (cf. memory feedback_dates_empty_string).
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS link_url text NULL;

-- Vérification :
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name = 'link_url';
--   -- Doit retourner (link_url, text, YES).
