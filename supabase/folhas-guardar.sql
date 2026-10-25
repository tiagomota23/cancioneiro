-- Guardar «Editar folha» numa só transação (v217): título/público/duração, cânticos (posição, acordes, partituras),
-- secções e grupos. Se algo falhar, a folha fica como estava. Não muda «published»: uma folha publicada continua
-- publicada (só «Despublicar» a despublica). Corre com as permissões de quem chama (RLS).
-- p = { meta: {title?, audience?, duration?, expires_at?}, songs: [{song_slug, position, no_chords, no_scores}],
--       sections: [{id (null = nova), title, position}], groups: [uuid] | null (null = não mexe) }
create or replace function public.save_collection(cid uuid, p jsonb) returns jsonb language plpgsql security invoker set search_path = public as $$
declare m jsonb := coalesce(p->'meta', '{}'::jsonb); s jsonb; out_secs jsonb;
begin
  if not exists (select 1 from public.collections where id = cid) then raise exception 'Folha não encontrada.'; end if;
  if m <> '{}'::jsonb then
    update public.collections set
      title = coalesce(m->>'title', title), audience = coalesce(m->>'audience', audience),
      duration = coalesce(m->>'duration', duration), expires_at = coalesce((m->>'expires_at')::timestamptz, expires_at)
    where id = cid;
    if not found then raise exception 'Sem permissão para esta folha.'; end if;
  end if;
  if p ? 'songs' then
    delete from public.collection_songs where collection_id = cid
      and song_slug not in (select x->>'song_slug' from jsonb_array_elements(p->'songs') x);
    insert into public.collection_songs (collection_id, song_slug, position, no_chords, no_scores)
      select cid, x->>'song_slug', (x->>'position')::int, coalesce((x->>'no_chords')::boolean, false), coalesce((x->>'no_scores')::boolean, false)
      from jsonb_array_elements(p->'songs') x
    on conflict (collection_id, song_slug) do update set position = excluded.position, no_chords = excluded.no_chords, no_scores = excluded.no_scores;
  end if;
  if p ? 'sections' then
    delete from public.collection_sections where collection_id = cid
      and id not in (select (x->>'id')::uuid from jsonb_array_elements(p->'sections') x where x->>'id' is not null);
    for s in select * from jsonb_array_elements(p->'sections') loop
      if s->>'id' is null then insert into public.collection_sections (collection_id, title, position) values (cid, s->>'title', (s->>'position')::int);
      else update public.collection_sections set title = s->>'title', position = (s->>'position')::int where id = (s->>'id')::uuid and collection_id = cid; end if;
    end loop;
  end if;
  if p ? 'groups' and jsonb_typeof(p->'groups') = 'array' then
    delete from public.collection_groups where collection_id = cid;
    insert into public.collection_groups (collection_id, group_id) select cid, (g #>> '{}')::uuid from jsonb_array_elements(p->'groups') g on conflict do nothing;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'position', position) order by position), '[]'::jsonb) into out_secs
    from public.collection_sections where collection_id = cid;
  return jsonb_build_object('sections', out_secs,
    'groups', (select coalesce(jsonb_agg(group_id), '[]'::jsonb) from public.collection_groups where collection_id = cid));
end $$;
revoke execute on function public.save_collection(uuid, jsonb) from public, anon;
grant execute on function public.save_collection(uuid, jsonb) to authenticated;
