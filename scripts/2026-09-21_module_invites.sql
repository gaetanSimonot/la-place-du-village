-- ═══════════════════════════════════════════════════════════════════════
-- LES INVITÉS D'UN MODULE
--
-- Des habitants nommés qui voient la section d'un module pendant son rodage,
-- sans être administrateurs. Montrer le théâtre à la programmatrice du
-- théâtre avant de l'ouvrir au village.
--
-- POURQUOI UNE TABLE ET PAS UNE CLÉ DE `config` : la table `config` est
-- lisible par n'importe quel visiteur (clé anonyme, RLS ouverte en lecture).
-- Y ranger des identifiants de comptes publierait la liste de ceux qu'on a
-- choisis. Ici, RLS est activée SANS AUCUNE POLICY : personne ne lit ni
-- n'écrit directement. Seul le serveur y touche, par la clé de service, qui
-- contourne RLS — et il ne renvoie jamais la liste, seulement un oui ou un
-- non pour le lecteur qui demande.
--
-- Rejouable : DROP POLICY IF EXISTS avant CREATE (CREATE POLICY n'est pas
-- idempotent sur Postgres).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.module_invites (
  -- La clé de visibilité du module, telle qu'elle vit dans `config` :
  -- 'theatre_village_public', 'cinema_village_public'…
  cle            text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Le réglage est éditorial, donc territorial. NULL = territoire par défaut.
  territoire_id  uuid references public.territoires(id) on delete cascade,
  created_at     timestamptz not null default now()
);

-- Un même habitant n'est invité qu'une fois par module et par territoire.
-- `coalesce` parce qu'un index unique ignore les lignes où une colonne est
-- NULL : sans lui, le territoire par défaut accepterait les doublons.
create unique index if not exists module_invites_unique
  on public.module_invites (cle, user_id, coalesce(territoire_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- La lecture se fait toujours par (clé, territoire).
create index if not exists module_invites_cle_terr
  on public.module_invites (cle, territoire_id);

alter table public.module_invites enable row level security;

-- Aucune policy, volontairement : la table est fermée à tout le monde.
-- On retire celles qui auraient pu être posées par un essai précédent.
drop policy if exists "module_invites_select" on public.module_invites;
drop policy if exists "module_invites_all"    on public.module_invites;
