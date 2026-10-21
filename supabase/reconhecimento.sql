-- Reconhecimento de cânticos (microfone) só para quem tem can_listen (família do Tiago).
alter table public.allowed_emails add column if not exists can_listen boolean not null default false;
update public.allowed_emails set can_listen = true where email in (
  'tiago.mota@gmail.com', 'anacatarina.mota@gmail.com', 'mbeatriz.mota@gmail.com',
  'mota.mleonor@gmail.com', 'mcons.mota@gmail.com', 'mteresa.mota@icloud.com');
create or replace function public.can_listen() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select can_listen from public.allowed_emails where email = lower(coalesce(auth.jwt() ->> 'email', ''))), false) $$;
revoke execute on function public.can_listen() from public, anon;
grant execute on function public.can_listen() to authenticated;
