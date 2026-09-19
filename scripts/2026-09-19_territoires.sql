-- ════════════════════════════════════════════════════════════════════════
-- TERRITOIRES — étape 1 : les fondations
--
-- L'app a vocation à couvrir plusieurs territoires : les Cévennes
-- aujourd'hui, Pau demain. Jusqu'ici « le territoire » n'existait nulle part
-- comme objet : il était éparpillé entre la table `zone_centres` et sept clés
-- de `config`. Impossible d'en avoir deux.
--
-- CETTE MIGRATION NE CHANGE RIEN AU COMPORTEMENT. Elle installe les tables,
-- crée un unique territoire — les Cévennes — repris des réglages actuels, et
-- y rattache tout l'existant. Un seul territoire, marqué par défaut : chaque
-- visiteur y est sans le savoir, exactement comme avant. Le second territoire
-- ne s'ajoutera qu'ensuite, et le choix restera réservé à l'admin.
--
-- LE GROUPE DÉCIDE DU TERRITOIRE. C'est le pari de conception, et il tient à
-- un fait : `messages_entrants.groupe` est déjà rempli à chaque message. Un
-- groupe WhatsApp ou Signal appartient à un territoire, et tout ce qu'il
-- apporte en hérite. C'est plus sûr que de déduire des coordonnées — ça marche
-- même quand le géocodage échoue, et ça tranche les cas de frontière.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Le territoire lui-même ───────────────────────────────────────────
create table if not exists territoires (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  nom                text not null,

  -- Les deux rayons, aujourd'hui dans `config`. Distincts à dessein :
  -- on ACCEPTE plus large qu'on n'AFFICHE, pour ne pas jeter à l'entrée
  -- ce qu'un réglage d'affichage pourra montrer plus tard.
  rayon_affichage_km int  not null default 45,
  rayon_insertion_km int  not null default 95,

  -- Le repère envoyé à Google pour lever les homonymes. Sans lui « Bréau »,
  -- à 12 km, part en Seine-et-Marne à 518. Il était figé en constante dans
  -- le code : il devient un réglage, parce qu'il change d'un territoire à
  -- l'autre (« Cévennes, Gard, Hérault » ici, « Béarn » à Pau).
  indice_geo         text not null default 'France',

  -- Un seul territoire par défaut : celui où atterrit qui n'a rien choisi.
  par_defaut         boolean not null default false,
  actif              boolean not null default true,
  created_at         timestamptz not null default now()
);

comment on table territoires is
  'Un territoire couvert par l''app. Porte les règles géographiques ; les points d''ancrage sont dans zone_centres, les réglages éditoriaux dans config.';

-- Un seul défaut possible, garanti par la base et non par le code.
drop index if exists territoires_un_seul_defaut;
create unique index territoires_un_seul_defaut
  on territoires ((par_defaut)) where par_defaut;

-- ── 2. Les points d'ancrage appartiennent à un territoire ───────────────
-- `zone_centres` est conservée telle quelle : un territoire peut avoir
-- plusieurs centres, et cette possibilité existe déjà.
alter table zone_centres
  add column if not exists territoire_id uuid references territoires(id) on delete cascade;

-- ── 3. Le groupe qui déclare son territoire ─────────────────────────────
create table if not exists territoire_groupes (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('whatsapp', 'signal')),
  groupe        text not null,
  territoire_id uuid not null references territoires(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (source, groupe)
);

comment on table territoire_groupes is
  'À quel territoire appartient un groupe WhatsApp/Signal. Ouvrir un territoire = y brancher des groupes locaux. Un groupe inconnu retombe sur le territoire par défaut.';

-- ── 4. Le contenu porte son territoire ──────────────────────────────────
-- Étape volontairement limitée à la chaîne d'ingestion : c'est elle qui doit
-- ranger le contenu à l'arrivée. Le reste (annonces, forum, éditorial) suivra
-- quand les lectures deviendront territoriales.
alter table lieux              add column if not exists territoire_id uuid references territoires(id);
alter table evenements         add column if not exists territoire_id uuid references territoires(id);
alter table messages_entrants  add column if not exists territoire_id uuid references territoires(id);

create index if not exists lieux_territoire_idx             on lieux (territoire_id);
create index if not exists evenements_territoire_idx        on evenements (territoire_id);
create index if not exists messages_entrants_territoire_idx on messages_entrants (territoire_id);

-- ── 5. Les Cévennes, reprises des réglages actuels ──────────────────────
insert into territoires (slug, nom, rayon_affichage_km, rayon_insertion_km, indice_geo, par_defaut)
select
  'cevennes',
  'Cévennes',
  coalesce((select value::int from config where key = 'rayon_affichage_km'), 45),
  coalesce((select value::int from config where key = 'rayon_insertion_km'), 95),
  'Cevennes, Gard, Herault, France',
  true
where not exists (select 1 from territoires where slug = 'cevennes');

-- ── 6. Tout l'existant y est rattaché ───────────────────────────────────
update zone_centres       set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update lieux              set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update evenements         set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;
update messages_entrants  set territoire_id = (select id from territoires where slug = 'cevennes') where territoire_id is null;

-- Les groupes déjà vus à l'arrivée sont cévenols. Un groupe non déclaré
-- retombera de toute façon sur le territoire par défaut : cette table sert à
-- dire « celui-là est ailleurs », pas à autoriser.
insert into territoire_groupes (source, groupe, territoire_id)
select distinct m.source, m.groupe, (select id from territoires where slug = 'cevennes')
from messages_entrants m
where m.groupe is not null and m.source in ('whatsapp', 'signal')
on conflict (source, groupe) do nothing;

-- ── 7. Lecture publique, écriture réservée ──────────────────────────────
-- L'app a besoin de lire les territoires côté client (le sélecteur admin, le
-- rayon de la carte). Les écritures passent par le service role, qui ignore
-- RLS. `territoire_groupes` n'a aucune raison d'être public.
alter table territoires        enable row level security;
alter table territoire_groupes enable row level security;

drop policy if exists "Territoires lisibles par tous" on territoires;
create policy "Territoires lisibles par tous"
  on territoires for select using (true);

-- Aucune policy de lecture sur territoire_groupes : seul le service role y accède.

-- ── Rollback ────────────────────────────────────────────────────────────
-- alter table lieux             drop column if exists territoire_id;
-- alter table evenements        drop column if exists territoire_id;
-- alter table messages_entrants drop column if exists territoire_id;
-- alter table zone_centres      drop column if exists territoire_id;
-- drop table if exists territoire_groupes;
-- drop table if exists territoires;
