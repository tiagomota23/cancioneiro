-- Endurecimento (revisão de segurança de 9 out 2026): aplicado no projeto Supabase; idempotente
-- só os tipos de ficheiro que a app, o Drive e a conversão de gravações usam; no máximo 50 MB
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','audio/mpeg','audio/mp4','audio/x-m4a','audio/m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/webm'],
  file_size_limit = 52428800 where id = 'coro';
-- funções de gatilho: ninguém as chama diretamente (os gatilhos continuam a correr)
revoke execute on function public.on_access_request(), public.on_auth_user_signin(), public.on_song_from_original(), public.on_sync_log(), public.song_edit_stamp() from public, anon, authenticated;
-- quem não tem sessão não precisa de is_allowed
revoke execute on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;
-- search_path fixo
alter function public.role_rank(text) set search_path = public;
alter function public.colecao_max_canticos() set search_path = public;
commit;
