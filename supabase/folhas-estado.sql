-- Folhas em edição ou publicadas: só os Maestros / Gestores editam e publicam; uma folha em edição fica escondida
-- de quem tem perfil Cancioneiro ou Coro (e do endereço partilhado) até ser publicada. As folhas novas começam em edição.
alter table public.collections add column if not exists published boolean not null default true; -- as que já existem ficam publicadas
alter table public.collections alter column published set default false;
drop policy if exists "colecoes ler" on public.collections;
create policy "colecoes ler" on public.collections for select to authenticated
  using ((select public.my_rank()) >= 3
         or ((select public.my_rank()) >= 1 and published and expires_at > now() and (audience = 'cancioneiro' or (select public.my_rank()) >= 2)));
-- cânticos de folhas para o Cancioneiro: só das folhas publicadas
create or replace function public.in_cancioneiro_collection(s text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.collection_songs cs join public.collections c on c.id = cs.collection_id
                  where cs.song_slug = s and c.audience = 'cancioneiro' and c.published and c.expires_at > now()) $$;
select 'ok' as folhas_estado;
