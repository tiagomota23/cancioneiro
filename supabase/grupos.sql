-- Grupos de utilizadores e folhas por grupo (v209).
-- Cada pessoa escolhe os seus grupos (Perfil → Grupos; e na 1.ª vez que abre a app). Sem grupo não recebe folhas.
-- Uma folha sem grupos é para todos os grupos. Maestro e Gestor veem todas as folhas. O Gestor gere a lista de grupos.
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists groups_name_ci on public.groups (lower(name));
create table if not exists public.user_groups (
  email text not null references public.allowed_emails(email) on update cascade on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (email, group_id)
);
create table if not exists public.collection_groups (
  collection_id uuid not null references public.collections(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (collection_id, group_id)
);
-- já escolheu os grupos? (pergunta da 1.ª abertura)
alter table public.allowed_emails add column if not exists groups_asked boolean not null default false;

alter table public.groups enable row level security;
alter table public.user_groups enable row level security;
alter table public.collection_groups enable row level security;
revoke all on public.groups, public.user_groups, public.collection_groups from public, anon, authenticated;
grant select, insert, update, delete on public.groups, public.user_groups, public.collection_groups to service_role;
grant select on public.groups to authenticated;
grant select on public.user_groups to authenticated;
grant select, insert, delete on public.collection_groups to authenticated;

drop policy if exists "grupos ler" on public.groups;
create policy "grupos ler" on public.groups for select to authenticated using ((select public.my_rank()) >= 1);
-- os seus grupos; Maestro / Gestor veem os de todos (Gestão)
drop policy if exists "grupos pessoa ler" on public.user_groups;
create policy "grupos pessoa ler" on public.user_groups for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or (select public.my_rank()) >= 3);
drop policy if exists "grupos folha ler" on public.collection_groups;
create policy "grupos folha ler" on public.collection_groups for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_groups.collection_id));
drop policy if exists "grupos folha gerir" on public.collection_groups;
create policy "grupos folha gerir" on public.collection_groups for all to authenticated
  using ((select public.my_rank()) >= 3) with check ((select public.my_rank()) >= 3);

-- a pessoa vê esta folha pelos grupos? (tem pelo menos um grupo, e a folha é para todos ou partilha um grupo)
create or replace function public.col_group_ok(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_groups where email = lower(coalesce(auth.jwt() ->> 'email', '')))
     and (not exists (select 1 from public.collection_groups where collection_id = cid)
          or exists (select 1 from public.collection_groups cg join public.user_groups ug on ug.group_id = cg.group_id
                     where cg.collection_id = cid and ug.email = lower(coalesce(auth.jwt() ->> 'email', ''))))
$$;
revoke execute on function public.col_group_ok(uuid) from public, anon;
grant execute on function public.col_group_ok(uuid) to authenticated;
drop policy if exists "colecoes ler" on public.collections;
create policy "colecoes ler" on public.collections for select using (
  (select public.my_rank()) >= 3
  or ((select public.my_rank()) >= 1 and published and expires_at > now()
      and (audience = 'cancioneiro' or (select public.my_rank()) >= 2) and public.col_group_ok(id)));

-- os meus grupos (escolha da própria pessoa)
create or replace function public.my_groups() returns table (group_id uuid, asked boolean) language sql stable security definer set search_path = public as $$
  select ug.group_id, ae.groups_asked from public.allowed_emails ae left join public.user_groups ug on ug.email = ae.email
  where ae.email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
create or replace function public.set_my_groups(ids uuid[]) returns void language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not exists (select 1 from public.allowed_emails where email = me) then raise exception 'sem acesso'; end if;
  delete from public.user_groups where email = me and not (group_id = any(coalesce(ids, '{}')));
  insert into public.user_groups (email, group_id) select me, g.id from public.groups g where g.id = any(coalesce(ids, '{}')) on conflict do nothing;
  update public.allowed_emails set groups_asked = true where email = me;
end $$;
-- Gestão (Maestro / Gestor): grupos de outra pessoa
create or replace function public.set_user_groups(target text, ids uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if (select public.my_rank()) < 3 then raise exception 'sem permissão'; end if;
  delete from public.user_groups where email = lower(target) and not (group_id = any(coalesce(ids, '{}')));
  insert into public.user_groups (email, group_id) select lower(target), g.id from public.groups g where g.id = any(coalesce(ids, '{}')) on conflict do nothing;
end $$;
-- Gestor: lista de grupos
create or replace function public.group_save(gid uuid, gname text) returns uuid language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(gname, '')); r uuid;
begin
  if (select public.my_rank()) < 4 then raise exception 'sem permissão'; end if;
  if n = '' or length(n) > 40 then raise exception 'Nome inválido.'; end if;
  if exists (select 1 from public.groups where lower(name) = lower(n) and id is distinct from gid) then raise exception 'Já existe um grupo com esse nome.'; end if;
  if gid is null then insert into public.groups (name, position) values (n, coalesce((select max(position) + 1 from public.groups), 0)) returning id into r;
  else update public.groups set name = n where id = gid returning id into r; end if;
  return r;
end $$;
-- Gestor: retirar um grupo; quem lá estava (e as folhas) passa para os grupos escolhidos.
-- Folhas que ficariam sem grupo (seriam para todos) passam a por publicar.
create or replace function public.group_remove(gid uuid, dest uuid[]) returns integer language plpgsql security definer set search_path = public as $$
declare hidden integer;
begin
  if (select public.my_rank()) < 4 then raise exception 'sem permissão'; end if;
  insert into public.user_groups (email, group_id) select ug.email, d from public.user_groups ug, unnest(coalesce(dest, '{}')) d
    where ug.group_id = gid and d <> gid on conflict do nothing;
  insert into public.collection_groups (collection_id, group_id) select cg.collection_id, d from public.collection_groups cg, unnest(coalesce(dest, '{}')) d
    where cg.group_id = gid and d <> gid on conflict do nothing;
  with alone as (select cg.collection_id from public.collection_groups cg where cg.group_id = gid
                 and not exists (select 1 from public.collection_groups o where o.collection_id = cg.collection_id and o.group_id <> gid))
  update public.collections set published = false where id in (select collection_id from alone);
  get diagnostics hidden = row_count;
  delete from public.groups where id = gid;
  return hidden;
end $$;
revoke execute on function public.my_groups(), public.set_my_groups(uuid[]), public.set_user_groups(text, uuid[]), public.group_save(uuid, text), public.group_remove(uuid, uuid[]) from public, anon;
grant execute on function public.my_groups(), public.set_my_groups(uuid[]), public.set_user_groups(text, uuid[]), public.group_save(uuid, text), public.group_remove(uuid, uuid[]) to authenticated;
