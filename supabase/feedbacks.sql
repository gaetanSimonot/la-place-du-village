-- Table feedbacks — corrections proposées par les utilisateurs
create table if not exists feedbacks (
  id           uuid default gen_random_uuid() primary key,
  evenement_id uuid references evenements(id) on delete cascade,
  evenement_titre text,          -- copie du titre au moment du feedback
  message      text not null,    -- ce qui doit être corrigé / ajouté
  contact      text,             -- optionnel : email ou tel du contributeur
  statut       text default 'nouveau' check (statut in ('nouveau', 'traité', 'ignoré')),
  created_at   timestamp with time zone default now()
);

-- RLS : tout le monde peut insérer, seul l'admin lit
alter table feedbacks enable row level security;

create policy "insert_feedback" on feedbacks
  for insert to anon, authenticated
  with check (true);

create policy "admin_read_feedback" on feedbacks
  for select using (auth.role() = 'authenticated');
