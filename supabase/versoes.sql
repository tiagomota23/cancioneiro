-- Versões do mesmo cântico noutra língua (ou noutro livro): a linha da versão aponta para o cântico principal.
-- A app esconde as versões das listas e mostra-as no seletor de língua do principal (versão Português | English …).
-- Pôr version_of a null desfaz a junção. Aplicado em 2026-10-11 (v193).
alter table songs add column if not exists version_of text references songs (slug) on update cascade on delete set null;
alter table songs drop constraint if exists songs_version_not_self;
alter table songs add constraint songs_version_not_self check (version_of is null or version_of <> slug);
create index if not exists songs_version_of_idx on songs (version_of);
