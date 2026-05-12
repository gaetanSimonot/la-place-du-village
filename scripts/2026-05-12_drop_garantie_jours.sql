-- Suppression du champ garantie_jours sur annonces — 2026-05-12
-- Pas pertinent pour des annonces entre particuliers : on retire.
ALTER TABLE public.annonces DROP COLUMN IF EXISTS garantie_jours;
