-- ════════════════════════════════════════════════════════════════════════
-- TERRITOIRES — étape 2 : tout le reste du contenu
--
-- La première migration n'avait rattaché que la chaîne d'ingestion (lieux,
-- événements, messages entrants) : de quoi ranger ce qui arrive. Celle-ci
-- s'occupe de tout ce qu'on LIT — l'annuaire, les annonces, le forum, le fil
-- du village, les bons plans, les mises en avant, l'éditorial.
--
-- Sans elle, basculer sur Pau laisserait voir les petites annonces cévenoles,
-- les commerces cévenols et le forum cévenol : la carte changerait de ville,
-- le reste non.
--
-- RIEN NE CHANGE POUR PERSONNE. Tout l'existant devient « Cévennes », il n'y a
-- qu'un territoire par défaut, et personne à part l'admin ne peut en changer.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. La colonne, partout où du contenu se lit ─────────────────────────
-- Trois familles, trois façons de la remplir plus tard :
--   géolocalisé — déduit des coordonnées (annuaire, producteurs, transport)
--   communautaire — déduit de l'auteur (annonces, posts, forum, moments…)
--   éditorial — choisi par l'admin (journal, radio, mises en avant)
alter table etablissements   add column if not exists territoire_id uuid references territoires(id);
alter table producers        add column if not exists territoire_id uuid references territoires(id);
alter table annonces         add column if not exists territoire_id uuid references territoires(id);
alter table posts            add column if not exists territoire_id uuid references territoires(id);
alter table forum_topics     add column if not exists territoire_id uuid references territoires(id);
alter table moments          add column if not exists territoire_id uuid references territoires(id);
alter table covoiturages     add column if not exists territoire_id uuid references territoires(id);
alter table promotions       add column if not exists territoire_id uuid references territoires(id);
alter table featured_slots   add column if not exists territoire_id uuid references territoires(id);
alter table journaux_hebdo   add column if not exists territoire_id uuid references territoires(id);
alter table articles_journal add column if not exists territoire_id uuid references territoires(id);
alter table radio_emissions  add column if not exists territoire_id uuid references territoires(id);
alter table transport_lignes add column if not exists territoire_id uuid references territoires(id);
alter table sources          add column if not exists territoire_id uuid references territoires(id);

-- `profiles` : le territoire de la personne. Il servira à ranger ce qu'elle
-- publie, et plus tard à lui ouvrir le choix de sa ville.
alter table profiles         add column if not exists territoire_id uuid references territoires(id);

-- ── 2. Les index, sans lesquels le filtre coûterait plus qu'il ne rapporte ─
create index if not exists etablissements_territoire_idx   on etablissements (territoire_id);
create index if not exists producers_territoire_idx        on producers (territoire_id);
create index if not exists annonces_territoire_idx         on annonces (territoire_id);
create index if not exists posts_territoire_idx            on posts (territoire_id);
create index if not exists forum_topics_territoire_idx     on forum_topics (territoire_id);
create index if not exists moments_territoire_idx          on moments (territoire_id);
create index if not exists covoiturages_territoire_idx     on covoiturages (territoire_id);
create index if not exists promotions_territoire_idx       on promotions (territoire_id);
create index if not exists featured_slots_territoire_idx   on featured_slots (territoire_id);
create index if not exists journaux_hebdo_territoire_idx   on journaux_hebdo (territoire_id);
create index if not exists articles_journal_territoire_idx on articles_journal (territoire_id);
create index if not exists radio_emissions_territoire_idx  on radio_emissions (territoire_id);
create index if not exists transport_lignes_territoire_idx on transport_lignes (territoire_id);
create index if not exists sources_territoire_idx          on sources (territoire_id);
create index if not exists profiles_territoire_idx         on profiles (territoire_id);

-- ── 3. Tout l'existant est cévenol ──────────────────────────────────────
-- Sans ambiguïté : il n'y avait qu'un territoire jusqu'ici.
update etablissements   set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update producers        set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update annonces         set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update posts            set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update forum_topics     set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update moments          set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update covoiturages     set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update promotions       set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update featured_slots   set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update journaux_hebdo   set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update articles_journal set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update radio_emissions  set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update transport_lignes set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update sources          set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update profiles         set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;

-- ── Rollback ────────────────────────────────────────────────────────────
-- alter table etablissements   drop column if exists territoire_id;
-- alter table producers        drop column if exists territoire_id;
-- alter table annonces         drop column if exists territoire_id;
-- alter table posts            drop column if exists territoire_id;
-- alter table forum_topics     drop column if exists territoire_id;
-- alter table moments          drop column if exists territoire_id;
-- alter table covoiturages     drop column if exists territoire_id;
-- alter table promotions       drop column if exists territoire_id;
-- alter table featured_slots   drop column if exists territoire_id;
-- alter table journaux_hebdo   drop column if exists territoire_id;
-- alter table articles_journal drop column if exists territoire_id;
-- alter table radio_emissions  drop column if exists territoire_id;
-- alter table transport_lignes drop column if exists territoire_id;
-- alter table sources          drop column if exists territoire_id;
-- alter table profiles         drop column if exists territoire_id;
