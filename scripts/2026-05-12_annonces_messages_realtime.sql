-- =====================================================================
-- Active Supabase Realtime sur la table annonces_messages.
--
-- Sans ça, les channels `supabase.channel(...).on('postgres_changes', ...)`
-- ne reçoivent jamais d'événement INSERT et les messages n'apparaissent
-- qu'après un reload manuel.
-- =====================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.annonces_messages;

-- Vérif (doit lister annonces_messages) :
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND schemaname = 'public';
