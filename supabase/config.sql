-- Table config — réglages globaux du site
create table if not exists config (
  key   text primary key,
  value text not null
);

-- Valeur par défaut : événements passés visibles (utile pour démo)
insert into config (key, value)
values ('masquer_passes', 'false')
on conflict (key) do nothing;

-- RLS : lecture publique, écriture admin seulement
alter table config enable row level security;

create policy "config_read" on config
  for select to anon, authenticated using (true);

create policy "config_write" on config
  for update using (auth.role() = 'authenticated');
