-- Arranque dos grupos (uma só vez, 24 out 2026): os cinco grupos iniciais, e todas as contas atuais em todos os grupos
-- (assim ninguém deixa de ver folhas). Quem já existia não recebe a pergunta da 1.ª abertura.
insert into public.groups (name, position) values ('Cavaleiros', 0), ('Liceus', 1), ('CLU', 2), ('Trabalhadores', 3), ('Fraternidade', 4)
  on conflict do nothing;
insert into public.user_groups (email, group_id) select ae.email, g.id from public.allowed_emails ae cross join public.groups g on conflict do nothing;
update public.allowed_emails set groups_asked = true;
