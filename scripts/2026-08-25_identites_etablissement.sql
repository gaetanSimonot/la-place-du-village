-- ============================================================================
-- Identités d'établissement (« blase ») — 2026-08-25
--
-- Permet à qui gère une fiche établissement de publier et de commenter sous
-- l'identité de cette fiche plutôt que sous son profil personnel.
--
--   etablissement_id NULL     → publié sous le profil de l'auteur (défaut)
--   etablissement_id renseigné → publié sous le nom + la photo de la fiche
--
-- Le lien user_id → auteur réel est CONSERVÉ partout (modération, quotas,
-- droits d'édition). Seul l'affichage change.
--
-- Rejouable : ADD COLUMN IF NOT EXISTS.
-- `evenements.etablissement_id` existe déjà, la ligne est là par sûreté.
-- ============================================================================

alter table annonces       add column if not exists etablissement_id uuid references etablissements(id) on delete set null;
alter table posts          add column if not exists etablissement_id uuid references etablissements(id) on delete set null;
alter table post_comments  add column if not exists etablissement_id uuid references etablissements(id) on delete set null;
alter table forum_topics   add column if not exists etablissement_id uuid references etablissements(id) on delete set null;
alter table forum_comments add column if not exists etablissement_id uuid references etablissements(id) on delete set null;
alter table evenements     add column if not exists etablissement_id uuid references etablissements(id) on delete set null;

-- Index : sert les vues « tout ce qui est publié par cette fiche ».
create index if not exists idx_annonces_etab       on annonces(etablissement_id)       where etablissement_id is not null;
create index if not exists idx_posts_etab          on posts(etablissement_id)          where etablissement_id is not null;
create index if not exists idx_post_comments_etab  on post_comments(etablissement_id)  where etablissement_id is not null;
create index if not exists idx_forum_topics_etab   on forum_topics(etablissement_id)   where etablissement_id is not null;
create index if not exists idx_forum_comments_etab on forum_comments(etablissement_id) where etablissement_id is not null;

-- ============================================================================
-- GARDE-FOU BASE
--
-- Les commentaires (posts et forum) sont insérés en DIRECT depuis le client
-- sous RLS, sans route serveur : une validation en TypeScript ne les
-- couvrirait pas. Ce trigger fait foi pour toutes les tables concernées.
--
-- `auth.uid() is null` = appel service role (nos routes API), qui valident
-- déjà via validerIdentiteDemandee() — on ne les bloque pas ici.
--
-- Volontairement SANS exception admin : être admin permet d'éditer une fiche,
-- pas de parler en son nom.
-- ============================================================================

create or replace function verifier_identite_etablissement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.etablissement_id is not null and auth.uid() is not null then
    if not exists (
      select 1 from etablissements e
      where e.id = new.etablissement_id and e.user_id = auth.uid()
    ) then
      raise exception 'Identité refusée : cette fiche ne vous est pas attribuée';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['annonces','posts','post_comments','forum_topics','forum_comments','evenements']
  loop
    execute format('drop trigger if exists trg_verifier_identite on %I', t);
    execute format(
      'create trigger trg_verifier_identite before insert or update of etablissement_id on %I
         for each row execute function verifier_identite_etablissement()', t);
  end loop;
end $$;
