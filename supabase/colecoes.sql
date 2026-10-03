-- Coleções: listas de cânticos criadas por um Maestro, para um público (Cancioneiro ou Coro) e por um tempo limitado
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 80),
  audience text not null check (audience in ('cancioneiro', 'coro')),
  duration text not null check (duration in ('24h', '48h', '1w', '1m')),
  expires_at timestamptz not null,
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create table if not exists public.collection_songs (
  collection_id uuid not null references public.collections(id) on delete cascade,
  song_slug text not null references public.songs(slug) on delete cascade on update cascade,
  position int not null default 0,
  primary key (collection_id, song_slug)
);
alter table public.collections enable row level security;
alter table public.collection_songs enable row level security;

-- Ver: o público certo enquanto não expira; Maestro e Gestor veem todas (também as expiradas, para as renovar)
drop policy if exists "colecoes ler" on public.collections;
create policy "colecoes ler" on public.collections for select to authenticated
  using ((select public.my_rank()) >= 3 or ((select public.my_rank()) >= 1 and expires_at > now()
         and (audience = 'cancioneiro' or (select public.my_rank()) >= 2)));
drop policy if exists "colecoes gerir" on public.collections;
create policy "colecoes gerir" on public.collections for all to authenticated
  using ((select public.my_rank()) >= 3) with check ((select public.my_rank()) >= 3);
drop policy if exists "colecoes canticos ler" on public.collection_songs;
create policy "colecoes canticos ler" on public.collection_songs for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id));
drop policy if exists "colecoes canticos gerir" on public.collection_songs;
create policy "colecoes canticos gerir" on public.collection_songs for all to authenticated
  using ((select public.my_rank()) >= 3) with check ((select public.my_rank()) >= 3);

grant select, insert, update, delete on public.collections, public.collection_songs to authenticated;
select 'ok' as colecoes;

-- Coleções para o público Cancioneiro podem ter qualquer cântico: enquanto a coleção durar, o perfil Cancioneiro vê-o
create or replace function public.in_cancioneiro_collection(s text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.collection_songs cs join public.collections c on c.id = cs.collection_id
                   where cs.song_slug = s and c.audience = 'cancioneiro' and c.expires_at > now()) $$;
revoke execute on function public.in_cancioneiro_collection(text) from public, anon;
grant execute on function public.in_cancioneiro_collection(text) to authenticated;
drop policy if exists "leitura familia" on public.songs;
create policy "leitura familia" on public.songs for select to authenticated
  using ((select public.my_rank()) >= 2 or ((select public.my_rank()) = 1 and (cancioneiro or public.in_cancioneiro_collection(slug))));

-- Coleções expiradas há mais de 1 mês são apagadas (todos os dias às 04:30 UTC)
select cron.schedule('cancioneiro-colecoes-limpeza', '30 4 * * *', $$ delete from public.collections where expires_at < now() - interval '1 month' $$);

-- Secções dentro de uma coleção: linhas separadoras na mesma ordem (position) que os cânticos
create table if not exists public.collection_sections (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  title text not null check (length(title) between 1 and 60),
  position int not null default 0
);
alter table public.collection_sections enable row level security;
drop policy if exists "colecoes seccoes ler" on public.collection_sections;
create policy "colecoes seccoes ler" on public.collection_sections for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id));
drop policy if exists "colecoes seccoes gerir" on public.collection_sections;
create policy "colecoes seccoes gerir" on public.collection_sections for all to authenticated
  using ((select public.my_rank()) >= 3) with check ((select public.my_rank()) >= 3);
grant select, insert, update, delete on public.collection_sections to authenticated;

-- Templates: conjuntos de secções pré-definidas para aplicar a uma coleção (só Maestro / Gestor)
create table if not exists public.collection_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 60),
  sections text[] not null default '{}',
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
alter table public.collection_templates enable row level security;
drop policy if exists "templates gerir" on public.collection_templates;
create policy "templates gerir" on public.collection_templates for all to authenticated
  using ((select public.my_rank()) >= 3) with check ((select public.my_rank()) >= 3);
grant select, insert, update, delete on public.collection_templates to authenticated;
insert into public.collection_templates (title, sections, created_by)
  select 'Missa', array['Entrada', 'Ofertório', 'Comunhão', 'Ação de Graças', 'Nossa Senhora'], 'tiago.mota@gmail.com'
  where not exists (select 1 from public.collection_templates where title = 'Missa');
