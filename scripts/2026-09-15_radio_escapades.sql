-- ════════════════════════════════════════════════════════════════════════
-- MODULE RADIO — la sélection culturelle de la semaine
--
-- Une émission est un enregistrement qu'on écoute, et une liste de rendez-vous
-- qu'elle cite. Les deux moitiés comptent autant : le podcast fait entendre la
-- sélection, l'app la rend cliquable.
--
-- CE QUI EST CITÉ N'EST PAS FORCÉMENT EN BASE. Une émission parle de ce qu'elle
-- veut, et la moitié de ce qu'elle annonce n'est jamais passée par nos
-- collecteurs. Une mention porte donc TOUJOURS son titre en clair, et
-- seulement PARFOIS un `evenement_id` : rattachée, on affiche la vraie fiche et
-- on y va ; non rattachée, on affiche le titre et on s'arrête là. Un seul
-- mécanisme avec une colonne vide, au lieu de deux listes à tenir d'accord.
--
-- Rejouable : tout est IF NOT EXISTS / OR REPLACE / DROP puis CREATE.
-- ════════════════════════════════════════════════════════════════════════

-- ── L'émission ──────────────────────────────────────────────────────────
create table if not exists radio_emissions (
  id          uuid primary key default gen_random_uuid(),

  -- La radio d'où vient l'émission. Une colonne et pas une table : il n'y en a
  -- qu'une, et le jour où il y en a deux, c'est une liste de valeurs, pas un
  -- modèle de plus.
  radio       text        not null default 'escapades',

  titre       text        not null,
  description text,

  -- L'audio. Une URL, parce que le podcast est déjà hébergé chez eux et que
  -- le recopier chez nous serait une copie à maintenir. Le champ accepte
  -- aussi une URL de notre Storage, si un jour on héberge.
  audio_url   text        not null,
  duree_s     integer,
  image_url   text,

  -- La semaine couverte. `semaine_debut` est un LUNDI : c'est la clé qui
  -- permet de retrouver l'émission qui parle de la semaine en cours, et
  -- d'empêcher deux émissions pour la même semaine.
  semaine_debut date      not null,

  statut      text        not null default 'publie'
              check (statut in ('brouillon', 'publie', 'archive')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Une seule émission par radio et par semaine. C'est la contrainte qui évite
-- qu'une double saisie fabrique deux lecteurs sur la page.
create unique index if not exists radio_emissions_semaine_unique
  on radio_emissions (radio, semaine_debut);

create index if not exists radio_emissions_recentes
  on radio_emissions (statut, semaine_debut desc);

-- ── Ce que l'émission cite ──────────────────────────────────────────────
create table if not exists radio_mentions (
  id           uuid primary key default gen_random_uuid(),
  emission_id  uuid not null references radio_emissions(id) on delete cascade,

  -- NULL = le rendez-vous n'est pas dans l'app. La ligne s'affiche quand même,
  -- mais elle ne mène nulle part.
  --
  -- `on delete set null` et pas `cascade` : si l'événement disparaît de la
  -- base, la mention doit RESTER — l'émission l'a bel et bien cité, et le
  -- faire disparaître de la liste réécrirait ce qui a été diffusé.
  evenement_id uuid references evenements(id) on delete set null,

  -- Toujours rempli, même quand `evenement_id` l'est aussi : c'est ce qui
  -- s'affiche pour une mention non rattachée, et c'est la trace de ce que
  -- l'émission a dit si la fiche est modifiée ou supprimée plus tard.
  titre        text not null,

  -- Le lieu et la date en clair, pour les mentions sans fiche. Rien d'autre
  -- ne peut les porter.
  detail       text,

  ordre        integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists radio_mentions_par_emission
  on radio_mentions (emission_id, ordre);

create index if not exists radio_mentions_par_evenement
  on radio_mentions (evenement_id) where evenement_id is not null;

-- Un même événement ne peut être cité qu'une fois par émission.
create unique index if not exists radio_mentions_unique
  on radio_mentions (emission_id, evenement_id) where evenement_id is not null;

-- ── LE DRAPEAU SUR L'ÉVÉNEMENT ──────────────────────────────────────────
--
-- « Sélection Radio Escapades » doit se voir PARTOUT où l'événement passe —
-- la carte, la liste, la fiche, la feuille — et pas seulement dans le module.
-- Le faire par une jointure obligerait chacun de ces écrans à interroger
-- `radio_mentions` en plus ; la carte en particulier affiche des centaines de
-- punaises et paierait une requête pour trois d'entre elles.
--
-- D'où une colonne, tenue à jour par la base elle-même. Un drapeau posé à la
-- main finit toujours par mentir : celui-ci ne peut pas, il est recalculé à
-- chaque écriture sur `radio_mentions`.
alter table evenements
  add column if not exists radio_selection boolean not null default false;

create index if not exists evenements_radio_selection
  on evenements (radio_selection) where radio_selection;

create or replace function maj_radio_selection() returns trigger
language plpgsql as $$
declare
  cible uuid;
begin
  -- Sur un UPDATE qui déplace la mention, les DEUX événements changent d'état.
  foreach cible in array array_remove(array[
    case when tg_op in ('UPDATE', 'DELETE') then old.evenement_id end,
    case when tg_op in ('UPDATE', 'INSERT') then new.evenement_id end
  ], null)
  loop
    update evenements e
       set radio_selection = exists (
             select 1
               from radio_mentions m
               join radio_emissions r on r.id = m.emission_id
              where m.evenement_id = cible
                and r.statut = 'publie')
     where e.id = cible
       and e.radio_selection is distinct from exists (
             select 1
               from radio_mentions m
               join radio_emissions r on r.id = m.emission_id
              where m.evenement_id = cible
                and r.statut = 'publie');
  end loop;
  return null;
end $$;

drop trigger if exists trg_radio_selection on radio_mentions;
create trigger trg_radio_selection
  after insert or update of evenement_id or delete on radio_mentions
  for each row execute function maj_radio_selection();

-- Publier ou dépublier une émission change l'état de tout ce qu'elle cite.
create or replace function maj_radio_selection_emission() returns trigger
language plpgsql as $$
begin
  update evenements e
     set radio_selection = exists (
           select 1
             from radio_mentions m
             join radio_emissions r on r.id = m.emission_id
            where m.evenement_id = e.id
              and r.statut = 'publie')
   where e.id in (select evenement_id from radio_mentions
                   where emission_id = new.id and evenement_id is not null);
  return null;
end $$;

drop trigger if exists trg_radio_selection_emission on radio_emissions;
create trigger trg_radio_selection_emission
  after update of statut on radio_emissions
  for each row execute function maj_radio_selection_emission();

-- ── Lecture publique, écriture par le service role ──────────────────────
--
-- Les écritures passent toutes par une route API avec `supabase-admin`, qui
-- contourne RLS. Il n'y a donc aucune politique d'écriture à déclarer : ne pas
-- en avoir, c'est l'interdire.
alter table radio_emissions enable row level security;
alter table radio_mentions  enable row level security;

drop policy if exists radio_emissions_lecture on radio_emissions;
create policy radio_emissions_lecture on radio_emissions
  for select using (statut = 'publie');

drop policy if exists radio_mentions_lecture on radio_mentions;
create policy radio_mentions_lecture on radio_mentions
  for select using (
    exists (select 1 from radio_emissions r
             where r.id = emission_id and r.statut = 'publie')
  );

-- ── La visibilité du module ─────────────────────────────────────────────
--
-- Mêmes trois valeurs que le cinéma (`cinema_village_public`), même défaut :
--   masque → personne, pas même les admins
--   admin  → les comptes admin seulement — le rodage
--   tous   → tous les habitants
--
-- On arrive en « admin ». La mention « Sélection Radio Escapades » sur les
-- fiches suit la MÊME clé : tant que le module est en rodage, elle ne doit
-- apparaître nulle part pour les habitants.
insert into config (key, value)
values ('radio_village_public', 'admin')
on conflict (key) do nothing;
