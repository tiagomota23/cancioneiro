-- Perfis de utilizador (hierárquicos): cancioneiro < coro < maestro < gestor
alter table public.allowed_emails add column if not exists role text not null default 'cancioneiro';
alter table public.allowed_emails drop constraint if exists allowed_emails_role_check;
alter table public.allowed_emails add constraint allowed_emails_role_check check (role in ('cancioneiro', 'coro', 'maestro', 'gestor'));
alter table public.allowed_emails add column if not exists name text;
alter table public.allowed_emails add column if not exists added_at timestamptz default now();
alter table public.allowed_emails add column if not exists added_by text;

create or replace function public.role_rank(r text) returns int language sql immutable as
$$ select case r when 'cancioneiro' then 1 when 'coro' then 2 when 'maestro' then 3 when 'gestor' then 4 else 0 end $$;
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.allowed_emails where email = lower(coalesce(auth.jwt() ->> 'email', '')) $$;
create or replace function public.my_rank() returns int language sql stable security definer set search_path = public as
$$ select coalesce(public.role_rank(public.my_role()), 0) $$;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.my_rank() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_rank() to authenticated;

-- Cânticos do Cancioneiro: os do site original e os promovidos por um Maestro
alter table public.songs add column if not exists cancioneiro boolean not null default true; -- novos cânticos vêm do site original
alter table public.songs add column if not exists promoted_by text;
alter table public.songs add column if not exists promoted_at timestamptz;
update public.songs s set cancioneiro = exists (select 1 from public.song_sources x where x.song_slug = s.slug and x.source = 'original')
  where cancioneiro is distinct from exists (select 1 from public.song_sources x where x.song_slug = s.slug and x.source = 'original');
grant select (cancioneiro, promoted_by, promoted_at) on public.songs to authenticated;

-- Perfil Cancioneiro: só os cânticos do Cancioneiro e sem ficheiros (partituras, gravações)
drop policy if exists "leitura familia" on public.songs;
create policy "leitura familia" on public.songs for select to authenticated
  using ((select public.my_rank()) >= 2 or ((select public.my_rank()) = 1 and cancioneiro));
drop policy if exists "fontes ler" on public.song_sources;
create policy "fontes ler" on public.song_sources for select to authenticated
  using (exists (select 1 from public.songs s where s.slug = song_slug));
drop policy if exists "etiquetas ler" on public.song_tags;
create policy "etiquetas ler" on public.song_tags for select to authenticated
  using ((select public.my_rank()) >= 2);
drop policy if exists "ficheiros ler" on public.song_files;
create policy "ficheiros ler" on public.song_files for select to authenticated
  using ((select public.my_rank()) >= 2);

-- Perfis iniciais
update public.allowed_emails set role = 'gestor', name = 'Tiago' where email = 'tiago.mota@gmail.com';
update public.allowed_emails set role = 'maestro', name = 'Constança' where email = 'mcons.mota@gmail.com';
update public.allowed_emails set role = 'maestro', name = 'Beatriz' where email = 'mbeatriz.mota@gmail.com';
update public.allowed_emails set role = 'coro', name = 'Teresa' where email in ('almeidamota.teresa@gmail.com', 'mteresa.mota@icloud.com');
update public.allowed_emails set role = 'cancioneiro', name = 'Catarina' where email = 'anacatarina.mota@gmail.com';
update public.allowed_emails set role = 'cancioneiro', name = 'Leonor' where email = 'mota.mleonor@gmail.com';

select email, name, role, (select count(*) from public.songs where cancioneiro) as cancioneiro_songs from public.allowed_emails order by public.role_rank(role) desc;
