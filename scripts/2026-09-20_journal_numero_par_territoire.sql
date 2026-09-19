-- ════════════════════════════════════════════════════════════════════════
-- LE JOURNAL REPART AU NUMÉRO 1 DANS CHAQUE TERRITOIRE
--
-- `journaux_hebdo_numero_key` impose l'unicité de `numero` sur TOUTE la
-- table. Deux conséquences, et aucune n'est acceptable :
--
--   — le premier journal de Pau porterait le numéro 19, parce que les
--     Cévennes en ont publié 18. « Le journal du village, numéro 19 » pour un
--     territoire qui ouvre : on annonce une histoire qui n'a pas eu lieu.
--   — et si on numérotait quand même à partir de 1, l'insertion serait
--     refusée (code 23505) : le journal de Pau ne pourrait pas naître.
--
-- L'unicité devient donc (territoire_id, numero) : chaque territoire tient sa
-- propre collection, et deux numéros 1 peuvent coexister sans se marcher
-- dessus.
--
-- Aucune donnée n'est touchée : les 18 numéros existants appartiennent tous
-- aux Cévennes et restent numérotés 1 à 18.
--
-- `nulls not distinct` : sans lui, Postgres considère deux `territoire_id`
-- NULL comme différents et laisserait passer des doublons. La colonne a un
-- défaut en base depuis 2026-09-19e et aucune ligne n'est orpheline, mais la
-- garantie doit tenir toute seule.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

alter table journaux_hebdo drop constraint if exists journaux_hebdo_numero_key;
drop index if exists journaux_hebdo_territoire_numero;

create unique index journaux_hebdo_territoire_numero
  on journaux_hebdo (territoire_id, numero) nulls not distinct;

-- ── Vérification ────────────────────────────────────────────────────────
-- select t.slug, count(*), min(j.numero), max(j.numero)
--   from journaux_hebdo j left join territoires t on t.id = j.territoire_id
--  group by t.slug;

-- ── Rollback ────────────────────────────────────────────────────────────
-- drop index if exists journaux_hebdo_territoire_numero;
-- alter table journaux_hebdo add constraint journaux_hebdo_numero_key unique (numero);
