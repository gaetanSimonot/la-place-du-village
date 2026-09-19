-- ════════════════════════════════════════════════════════════════════════
-- CONFIG PAR TERRITOIRE — sans toucher à `config`
--
-- Le problème : `config` a `key` pour clé primaire (`config_pkey`, vérifié en
-- tentant un doublon). Une seule ligne par réglage, donc pas de place pour
-- « le héros de Pau » à côté de « le héros des Cévennes ».
--
-- LA SOLUTION N'EST PAS DE CHANGER CETTE CLÉ. Dix-sept écritures font
-- `upsert(..., { onConflict: 'key' })` : une clé primaire double les rendrait
-- fausses — elles créeraient des doublons au lieu de mettre à jour, et on
-- aurait deux « mode maintenance » dont le gagnant dépendrait de l'ordre de
-- lecture. Sur une table qui porte la maintenance, le rayon de la carte et les
-- quotas de l'assistant, c'est inacceptable.
--
-- On ajoute donc une table À CÔTÉ. `config` ne bouge pas d'un octet : ses 17
-- écritures et ses 71 lectures continuent exactement comme aujourd'hui. Les
-- valeurs propres à un territoire vivent ici, et un helper lit l'une puis
-- l'autre. La reprise se fait clé par clé, écran par écran, sans jamais
-- exposer l'existant.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists config_territoire (
  territoire_id uuid not null references territoires(id) on delete cascade,
  key           text not null,
  value         text,
  updated_at    timestamptz not null default now(),
  primary key (territoire_id, key)
);

comment on table config_territoire is
  'Réglages propres à un territoire. `config` reste la valeur globale / du territoire par défaut ; cette table ne contient que ce qui diffère. Une clé absente ici ne veut pas dire « prends celle des Cévennes » : voir CLES_EDITORIALES côté code.';

create index if not exists config_territoire_key_idx on config_territoire (key);

-- Lecture publique : l'app lit ces réglages côté client comme elle lit déjà
-- `config` (le sous-titre du hub, la visibilité de la radio…). Les écritures
-- passent par le service role, qui ignore RLS.
alter table config_territoire enable row level security;

drop policy if exists "Config territoire lisible par tous" on config_territoire;
create policy "Config territoire lisible par tous"
  on config_territoire for select using (true);

-- ── Rollback ────────────────────────────────────────────────────────────
-- drop table if exists config_territoire;
