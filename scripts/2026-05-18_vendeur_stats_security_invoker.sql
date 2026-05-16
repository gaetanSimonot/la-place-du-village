-- =====================================================================
-- Fix security warning : vue vendeur_stats en security_invoker
-- Date : 2026-05-18
--
-- Supabase Linter signale (ERROR / EXTERNAL / SECURITY) :
--   "View public.vendeur_stats is defined with the SECURITY DEFINER property"
--
-- Les vues PostgreSQL héritent par défaut du contexte de sécurité de leur
-- créateur (= postgres dans Supabase). Cela contourne la RLS de l'user qui
-- requête → on force `security_invoker = true` pour que la vue applique
-- la RLS du caller (cohérent avec la table annonces_ratings).
--
-- Postgres 15+ uniquement (Supabase est sur PG 15+).
-- =====================================================================

ALTER VIEW public.vendeur_stats SET (security_invoker = true);

-- Vérification :
--   SELECT relname, reloptions FROM pg_class
--   WHERE relname = 'vendeur_stats' AND relkind = 'v';
--   -- Doit contenir {security_invoker=true}
