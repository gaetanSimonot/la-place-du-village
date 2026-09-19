-- ════════════════════════════════════════════════════════════════════════
-- COLLECTEUR FACEBOOK — ce que la base doit accepter
--
-- Un troisième collecteur arrive : Facebook, sur PC, qui servira Pau. Deux
-- choses le bloqueraient aujourd'hui, et la première en SILENCE.
--
-- 1. `evenements_source_check` refuse la valeur « facebook ». Vérifié en
--    essayant un INSERT : code 23514, contrainte nommée. Le piège est connu
--    sur ce projet — un CHECK violé fait disparaître un INSERT sans bruit
--    quand l'appelant ne lit pas l'erreur, et on croit que le collecteur ne
--    marche pas. `messages_entrants.source`, lui, n'a AUCUNE contrainte
--    (vérifié de la même façon) : il accepte déjà.
--
-- 2. Le permalien d'un post Facebook n'a nulle part où aller. C'est pourtant
--    la seule façon de remonter à la publication d'origine depuis l'inbox
--    admin quand une fiche paraît douteuse — WhatsApp et Signal n'ont pas
--    d'équivalent, Facebook si. On le garde.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. « facebook » devient une source d'événement légitime ─────────────
-- La liste reprend toutes les valeurs en usage (whatsapp, signal, scrape,
-- formulaire) plus « admin », historique, et ajoute « facebook ».
alter table evenements drop constraint if exists evenements_source_check;
alter table evenements add constraint evenements_source_check
  check (source in ('whatsapp', 'signal', 'facebook', 'scrape', 'formulaire', 'admin'));

-- ── 2. Le lien vers le post d'origine ───────────────────────────────────
alter table messages_entrants
  add column if not exists permalien text;

comment on column messages_entrants.permalien is
  'URL du post d''origine, quand la source en fournit une (Facebook). Sert à vérifier une fiche douteuse sans quitter l''admin.';

-- ── Vérification (à lire après avoir joué la migration) ─────────────────
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid = 'evenements'::regclass and contype = 'c';

-- ── Rollback ────────────────────────────────────────────────────────────
-- alter table messages_entrants drop column if exists permalien;
-- alter table evenements drop constraint if exists evenements_source_check;
-- alter table evenements add constraint evenements_source_check
--   check (source in ('whatsapp', 'signal', 'scrape', 'formulaire', 'admin'));
