-- ============================================================
-- Supabase Auth Setup — La Place du Village
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Table profiles (liée à auth.users)
create table if not exists public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  display_name  text,
  avatar_url    text,
  email         text,
  created_at    timestamptz default now()
);

-- 2. RLS activé
alter table public.profiles enable row level security;

-- 3. Politiques RLS (chaque user voit/modifie uniquement son propre profil)
create policy "Lecture profil personnel"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Création profil personnel"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Modification profil personnel"
  on public.profiles for update
  using (auth.uid() = id);

-- 4. Fonction trigger : crée le profil automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Attacher le trigger sur auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Config à faire dans Supabase Dashboard > Authentication
-- ============================================================
-- • Site URL          : https://ton-app.vercel.app
-- • Redirect URLs     : https://ton-app.vercel.app/auth/callback
--                       http://localhost:3000/auth/callback  (dev)
--
-- Pour Google OAuth :
-- • Authentication > Providers > Google → activer
-- • Créer un projet Google Cloud Console, activer OAuth 2.0
-- • Client ID + Secret → coller dans Supabase
-- • URI de redirection autorisé dans Google :
--   https://pboaaykucqbmxryyxslz.supabase.co/auth/v1/callback
-- ============================================================
