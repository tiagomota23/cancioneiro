-- Novos Cânticos: acrescentados na app (perfil Coro para cima). Do Coro ficam pendentes até um Maestro aprovar;
-- de um Maestro / Gestor ficam logo aprovados. Pendentes: só os vê quem os acrescentou e os Maestros / Gestores.
alter table public.song_sources drop constraint if exists song_sources_source_check;
alter table public.song_sources add constraint song_sources_source_check check (source in ('original', 'coro_clu', 'canti2024', 'songbook', 'novos'));
alter table public.songs add column if not exists approved boolean not null default true;
alter table public.songs add column if not exists added_by text;
alter table public.songs add column if not exists added_at timestamptz;
alter table public.songs add column if not exists approved_by text;
grant select (approved, added_by, added_at, approved_by) on public.songs to authenticated;
drop policy if exists "leitura familia" on public.songs;
create policy "leitura familia" on public.songs for select to authenticated
  using (((select public.my_rank()) >= 2 or ((select public.my_rank()) = 1 and (cancioneiro or public.in_cancioneiro_collection(slug))))
         and (approved or (select public.my_rank()) >= 3 or added_by = lower(coalesce(auth.jwt() ->> 'email', ''))));
select 'ok' as novos;
