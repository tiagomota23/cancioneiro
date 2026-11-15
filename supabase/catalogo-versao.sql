-- Versão do catálogo (lista de cânticos com fontes, etiquetas e ficheiros): um número que sobe sempre que algo muda.
-- A app lê só este número ao abrir (e ao voltar a ela) e só descarrega a lista (~1 MB) se mudou — em eventos, centenas
-- de pessoas abrem a app ao mesmo tempo e a lista quase nunca mudou.
create table if not exists public.catalog_version (
  id int primary key default 1 check (id = 1),
  v  bigint not null default 1,
  at timestamptz not null default now()
);
insert into public.catalog_version (id) values (1) on conflict do nothing;
alter table public.catalog_version enable row level security;
drop policy if exists "versao ler" on public.catalog_version;
create policy "versao ler" on public.catalog_version for select to authenticated using (public.is_allowed());
revoke all on public.catalog_version from anon, authenticated;
grant select on public.catalog_version to authenticated;
grant all on public.catalog_version to service_role;

create or replace function public.catalog_bump() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.catalog_version set v = v + 1, at = now() where id = 1;
  return null;
end $$;
revoke all on function public.catalog_bump() from public, anon, authenticated;

-- uma vez por instrução (não por linha): uma importação de 1000 linhas sobe a versão uma vez
do $$ declare t text; begin
  foreach t in array array['songs', 'song_sources', 'song_tags', 'song_files'] loop
    execute format('drop trigger if exists catalog_bump on public.%I', t);
    execute format('create trigger catalog_bump after insert or update or delete on public.%I for each statement execute function public.catalog_bump()', t);
  end loop;
end $$;
