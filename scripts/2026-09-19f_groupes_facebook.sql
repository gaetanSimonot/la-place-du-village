-- ════════════════════════════════════════════════════════════════════════
-- LES GROUPES FACEBOOK PEUVENT ÊTRE DÉCLARÉS, EUX AUSSI
--
-- `territoire_groupes.source` n'acceptait que 'whatsapp' et 'signal' : la
-- table a été écrite avant que le collecteur Facebook existe. Résultat, la
-- page « Live In Pau » envoie déjà des messages (deux reçus le 19/09) mais il
-- est IMPOSSIBLE de déclarer à quel territoire elle appartient — l'insertion
-- est rejetée par la contrainte (code 23514).
--
-- Sans déclaration, le groupe retombe sur le territoire par défaut. Depuis
-- l'arbitrage géographique ce n'est plus fatal — un événement palois part à
-- Pau même annoncé dans un groupe cévenol. Mais la présomption sert encore à
-- ORIENTER le géocodage : avec le mauvais repère, « Jurançon » ou « Lescar »
-- peuvent partir chercher leur homonyme ailleurs en France, et l'arbitrage
-- range alors un point faux.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

alter table territoire_groupes drop constraint if exists territoire_groupes_source_check;
alter table territoire_groupes add  constraint territoire_groupes_source_check
  check (source in ('whatsapp', 'signal', 'facebook'));

-- ── Vérification ────────────────────────────────────────────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'territoire_groupes'::regclass;
