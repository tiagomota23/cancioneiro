-- O Maestro só vê, gere e publica folhas dos seus grupos (pedido do Tiago, 24 out 2026). O Gestor continua a ver todas.
-- «Dos seus grupos»: a folha é para todos os grupos ou partilha um grupo com ele (col_group_ok); sem grupo, nenhuma.
create or replace function public.my_group(gid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_groups where email = lower(coalesce(auth.jwt() ->> 'email', '')) and group_id = gid)
$$;
revoke execute on function public.my_group(uuid) from public, anon;
grant execute on function public.my_group(uuid) to authenticated;

drop policy if exists "colecoes ler" on public.collections;
create policy "colecoes ler" on public.collections for select using (
  (select public.my_rank()) >= 4
  or ((select public.my_rank()) = 3 and public.col_group_ok(id))
  or ((select public.my_rank()) >= 1 and published and expires_at > now()
      and (audience = 'cancioneiro' or (select public.my_rank()) >= 2) and public.col_group_ok(id)));
drop policy if exists "colecoes gerir" on public.collections;
create policy "colecoes gerir" on public.collections for all
  using ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.col_group_ok(id)))
  with check ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.col_group_ok(id)));

drop policy if exists "colecoes canticos gerir" on public.collection_songs;
create policy "colecoes canticos gerir" on public.collection_songs for all
  using ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.col_group_ok(collection_id)))
  with check ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.col_group_ok(collection_id)));
drop policy if exists "colecoes seccoes gerir" on public.collection_sections;
create policy "colecoes seccoes gerir" on public.collection_sections for all
  using ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.col_group_ok(collection_id)))
  with check ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.col_group_ok(collection_id)));
-- grupos de uma folha: o Maestro só põe e tira os seus grupos (os outros grupos da folha ficam)
drop policy if exists "grupos folha gerir" on public.collection_groups;
create policy "grupos folha gerir" on public.collection_groups for all
  using ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.my_group(group_id) and public.col_group_ok(collection_id)))
  with check ((select public.my_rank()) >= 4 or ((select public.my_rank()) = 3 and public.my_group(group_id) and public.col_group_ok(collection_id)));

-- Um Maestro que não está em todos os grupos não pode deixar uma folha publicada sem grupos (seria para todos os
-- grupos): nem criá-la assim, nem publicá-la assim, nem tirar-lhe o último grupo. Verificado no fim do pedido (deferred).
create or replace function public.col_groups_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if coalesce((select public.my_rank()), 0) <> 3 then return null; end if;
  if not exists (select 1 from public.groups g where not public.my_group(g.id)) then return null; end if; -- está em todos
  if tg_table_name = 'collections' then
    -- só ao criar publicada ou ao publicar (editar uma folha já publicada para todos os grupos não a alarga)
    if tg_op = 'UPDATE' and (old.published or not new.published) then return null; end if;
    cid := new.id;
  else cid := old.collection_id; end if;
  if exists (select 1 from public.collections c where c.id = cid and c.published)
     and not exists (select 1 from public.collection_groups where collection_id = cid) then
    raise exception 'Uma folha publicada tem de ficar com pelo menos um dos seus grupos.';
  end if;
  return null;
end $$;
drop trigger if exists col_groups_guard_c on public.collections;
create constraint trigger col_groups_guard_c after insert or update on public.collections
  deferrable initially deferred for each row execute function public.col_groups_guard();
drop trigger if exists col_groups_guard_g on public.collection_groups;
create constraint trigger col_groups_guard_g after delete on public.collection_groups
  deferrable initially deferred for each row execute function public.col_groups_guard();

-- Trocar os grupos de uma folha numa só transação (v213): assim uma folha publicada nunca fica, entre dois pedidos,
-- sem grupos. Corre com as permissões de quem chama (RLS: o Maestro só toca nos seus grupos).
create or replace function public.set_collection_groups(cid uuid, ids uuid[]) returns setof uuid language plpgsql security invoker set search_path = public as $$
begin
  delete from public.collection_groups where collection_id = cid;
  insert into public.collection_groups (collection_id, group_id) select cid, g from unnest(coalesce(ids, '{}')) g on conflict do nothing;
  return query select group_id from public.collection_groups where collection_id = cid;
end $$;
revoke execute on function public.set_collection_groups(uuid, uuid[]) from public, anon;
grant execute on function public.set_collection_groups(uuid, uuid[]) to authenticated;
-- função de gatilho: ninguém a chama diretamente (higiene, como as outras)
revoke execute on function public.col_groups_guard() from public, anon, authenticated;
