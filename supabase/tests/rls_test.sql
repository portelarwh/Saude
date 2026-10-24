-- Cenário 12: um usuário não consegue acessar informações privadas de outro.
-- Executado por scripts/test-db.sh. Qualquer falha aborta com erro.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.com');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Ana cria seus dados
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into public.profiles (id, name, health_notes) values ('11111111-1111-1111-1111-111111111111', 'Ana', 'informação sensível');
insert into public.water_logs (date, logged_at, volume_ml, beverage) values ('2026-10-19', now(), 250, 'water');
insert into public.body_assessments (measured_at, input, metrics) values (now(), 'manual', '{"weight_kg":{"value":70,"unit":"kg"}}');
insert into public.foods (id, name, base_unit, source, verification, per100, tags) values ('user:whey', 'Whey', 'g', 'label', 'reported', '{"protein_g":70}', array['pós-treino']);
select pg_temp.assert(exists (select 1 from public.search_foods('pós-treino') where id = 'user:whey'), 'busca encontra alimento pela tag do usuário');
insert into storage.objects (bucket_id, name) values ('health-files', '11111111-1111-1111-1111-111111111111/exames/a.pdf');
insert into public.saved_meals (name, items) values ('Café proteico', '[]');
select pg_temp.assert((select count(*) from public.water_logs) = 1, 'Ana vê o próprio registro de água');
reset role;

-- Bruno tenta acessar
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.assert((select count(*) from public.profiles) = 0, 'Bruno não lê o perfil de Ana');
select pg_temp.assert((select count(*) from public.water_logs) = 0, 'Bruno não lê a água de Ana');
select pg_temp.assert((select count(*) from public.body_assessments) = 0, 'Bruno não lê exames de Ana');
select pg_temp.assert((select count(*) from public.foods) = 0, 'Bruno não lê alimentos de Ana');
select pg_temp.assert((select count(*) from public.saved_meals) = 0, 'Bruno não lê refeições salvas de Ana');
select pg_temp.assert((select count(*) from storage.objects) = 0, 'Bruno não lista arquivos de Ana');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'Bruno não lê o histórico de Ana');

with u as (update public.water_logs set volume_ml = 1 returning 1)
select pg_temp.assert((select count(*) from u) = 0, 'Bruno não altera registros de Ana');
with d as (delete from public.body_assessments returning 1)
select pg_temp.assert((select count(*) from d) = 0, 'Bruno não exclui exames de Ana');

do $$
begin
  insert into public.water_logs (user_id, date, logged_at, volume_ml, beverage)
  values ('11111111-1111-1111-1111-111111111111', '2026-10-19', now(), 999, 'water');
  raise exception 'FALHOU: Bruno conseguiu inserir em nome de Ana';
exception when insufficient_privilege then
  raise notice 'ok - Bruno não insere dados em nome de Ana';
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name) values ('health-files', '11111111-1111-1111-1111-111111111111/exames/x.pdf');
  raise exception 'FALHOU: Bruno conseguiu gravar na pasta de Ana';
exception when insufficient_privilege then
  raise notice 'ok - Bruno não grava arquivos na pasta de Ana';
end $$;

-- Base de referência é legível por todos, mas não editável
select pg_temp.assert((select count(*) from public.reference_foods) > 500, 'base TACO legível por usuários autenticados');
do $$
begin
  update public.reference_foods set name = 'x' where id = 'taco:1';
  raise exception 'FALHOU: usuário alterou a base de referência';
exception when insufficient_privilege then
  raise notice 'ok - base de referência é somente leitura';
end $$;
select pg_temp.assert((select count(*) from public.search_foods('frango peito grelhado')) > 0, 'busca textual funciona');
select pg_temp.assert((select tags from public.reference_foods where id = 'taco:1') is not null and exists (select 1 from public.search_foods('fruta') s join public.reference_foods r using (id) where r.category = 'Frutas e derivados'), 'busca por grupo (tag da categoria) encontra frutas');
select pg_temp.assert(not exists (select 1 from public.search_foods('pós-treino') where id = 'user:whey'), 'tags de outro usuário não aparecem na busca');
select pg_temp.assert(not exists (select 1 from public.search_foods('whey') where id = 'user:whey'), 'busca não retorna alimentos de outro usuário');
reset role;

-- Anônimo não lê nada
set role anon;
do $$
begin
  perform count(*) from public.water_logs;
  raise exception 'FALHOU: anônimo leu dados';
exception when insufficient_privilege then
  raise notice 'ok - anônimo sem acesso';
end $$;
reset role;

-- Rastreabilidade e bloqueio de dieta prescrita
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update public.profiles set name = 'Ana Maria' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert(
  (select changed_columns = array['name'] and old_row is null from public.audit_log where table_name = 'profiles' limit 1),
  'alteração de perfil registrada sem copiar dados sensíveis');
update public.profiles set objectives = array['fat_loss', 'muscle_gain'], objective = 'recomposition';
do $$
begin
  update public.profiles set objectives = array['dieta_magica'];
  raise exception 'FALHOU: objetivo inválido aceito';
exception when check_violation then
  raise notice 'ok - objetivos aceitam só valores conhecidos';
end $$;
insert into public.diet_plans (name, origin, locked, meals) values ('Plano da nutri', 'professional', true, '[]');
do $$
begin
  update public.diet_plans set meals = '[{"name":"x"}]';
  raise exception 'FALHOU: plano bloqueado foi alterado';
exception when check_violation then
  raise notice 'ok - plano prescrito bloqueado para alteração';
end $$;
delete from public.body_assessments;
select pg_temp.assert((select count(*) from public.audit_log where table_name = 'body_assessments' and action = 'delete') = 1, 'exclusão de exame registrada no histórico');
reset role;

-- Exclusão de conta remove todos os dados (on delete cascade)
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert((select count(*) from public.water_logs) = 0 and (select count(*) from public.profiles) = 0, 'exclusão da conta apaga os dados associados');
