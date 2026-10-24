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
