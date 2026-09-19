-- ════════════════════════════════════════════════════════════════════════
-- FILET DE SÉCURITÉ : plus rien ne peut naître sans territoire
--
-- Depuis que les lectures filtrent par territoire, une ligne créée avec
-- `territoire_id` vide est INVISIBLE PARTOUT — dans les deux villes, pour son
-- auteur comme pour les autres, et sans message d'erreur. La publication
-- répond « ok » et le contenu n'existe nulle part.
--
-- Dix chemins d'écriture ont déjà été corrigés dans le code. Mais le code
-- omet la colonne quand il n'a pas pu lire la table `territoires` — une
-- lecture qui échoue, un déploiement à moitié propagé — et ce cas-là produit
-- exactement la panne silencieuse qu'on veut rendre impossible.
--
-- On pose donc la valeur par défaut EN BASE. Une insertion qui oublie la
-- colonne atterrit aux Cévennes au lieu de nulle part : visible, donc
-- corrigeable. Se tromper de ville est réparable en une ligne ; disparaître
-- ne se remarque pas.
--
-- ⚠️ Ce défaut est FIGÉ sur les Cévennes, pas sur « le territoire par
-- défaut » — Postgres ne sait pas défaultiser depuis une sous-requête. Si le
-- territoire par défaut change un jour, rejouer ce script avec le nouvel
-- identifiant. Ça reste un filet, pas le chemin normal : le code, lui, pose
-- toujours le bon territoire.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  cevennes uuid;
  t text;
begin
  select id into cevennes from territoires where slug = 'cevennes';
  if cevennes is null then
    raise exception 'Territoire « cevennes » introuvable — jouer 2026-09-19_territoires.sql d''abord.';
  end if;

  foreach t in array array[
    'evenements', 'lieux', 'messages_entrants',
    'etablissements', 'producers', 'annonces', 'posts', 'forum_topics',
    'moments', 'covoiturages', 'promotions', 'featured_slots',
    'journaux_hebdo', 'articles_journal', 'radio_emissions',
    'transport_lignes', 'sources', 'profiles'
  ] loop
    execute format('alter table %I alter column territoire_id set default %L', t, cevennes);
  end loop;
end $$;

-- ── Vérification (à lire après avoir joué la migration) ─────────────────
-- select table_name, column_default from information_schema.columns
--  where column_name = 'territoire_id' order by table_name;

-- ── Rollback ────────────────────────────────────────────────────────────
-- do $$ declare t text; begin
--   foreach t in array array['evenements','lieux','messages_entrants','etablissements',
--     'producers','annonces','posts','forum_topics','moments','covoiturages','promotions',
--     'featured_slots','journaux_hebdo','articles_journal','radio_emissions',
--     'transport_lignes','sources','profiles'] loop
--     execute format('alter table %I alter column territoire_id drop default', t);
--   end loop; end $$;
