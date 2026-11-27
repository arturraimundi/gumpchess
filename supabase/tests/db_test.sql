-- Testes de integração do banco: regras de acesso (RLS), convites, contas e relatórios.
-- Rodar com: ./scripts/test-db.sh  (sobe um Postgres temporário, aplica shim + migrations e executa este arquivo)
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- ---------- helpers ----------
create schema test;
grant usage on schema test to authenticated;

create function test.eq(actual anyelement, expected anyelement, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALHOU: % (esperado %, obtido %)', msg, expected, actual;
  end if;
  raise notice 'ok - %', msg;
end $$;

create function test.throws(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then
      raise notice 'ok - %', msg;
      return;
    end if;
    raise exception 'FALHOU: % (erro inesperado: %)', msg, sqlerrm;
  end;
  raise exception 'FALHOU: % (deveria ter dado erro "%")', msg, pattern;
end $$;

grant execute on all functions in schema test to authenticated;

-- ---------- usuários ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com',  '{"display_name": "Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com',  '{"display_name": "Bia"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@ex.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@ex.com', '{"display_name": "Duda"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@ex.com',  '{"display_name": "Eva"}');

select test.eq((select display_name from profiles where id = '00000000-0000-0000-0000-00000000000c'), 'caio',
  'perfil criado no cadastro usa o e-mail quando não há nome');

\set ana  '00000000-0000-0000-0000-00000000000a'
\set bia  '00000000-0000-0000-0000-00000000000b'
\set caio '00000000-0000-0000-0000-00000000000c'
\set duda '00000000-0000-0000-0000-00000000000d'
\set eva  '00000000-0000-0000-0000-00000000000e'

set role authenticated;

-- ---------- criação da república ----------
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select create_republic('Rep Toca') as rid \gset

select test.eq((select role from republic_members where republic_id = :'rid' and user_id = :'ana'), 'admin',
  'quem cria a república vira admin');
select test.eq((select count(*) from bill_categories where republic_id = :'rid' and is_default)::int, 8,
  'república nasce com 8 contas padrão');
select test.eq((select count(*) from bill_categories where republic_id = :'rid' and kind = 'fixed')::int, 3,
  'aluguel, condomínio e internet são fixas');

select set_config('request.jwt.claim.sub', :'bia', false) \gset
select test.eq((select count(*) from republics)::int, 0, 'quem não é membro não vê a república');
select test.eq((select count(*) from bill_categories)::int, 0, 'quem não é membro não vê as categorias');
select test.throws(format('select generate_invite_code(%L)', :'rid'), 'forbidden', 'não-membro não gera código');

-- ---------- convites ----------
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select code as code1 from generate_invite_code(:'rid') \gset
select test.eq(:'code1' ~ '^[0-9]{7}$', true, 'código tem 7 dígitos');
select test.throws(format('select generate_invite_code(%L, 1)', :'rid'), 'invalid_ttl', 'validade mínima de 5 minutos');

select set_config('request.jwt.claim.sub', :'bia', false) \gset
select test.eq((select join_republic('0000000') ->> 'error'), 'invalid_or_expired_code', 'código errado é recusado');
select test.eq((select (join_republic(:'code1') ->> 'ok')::boolean), true, 'bia entra com o código');
select test.eq((select (join_republic(:'code1') ->> 'ok')::boolean), true, 'entrar de novo é idempotente');
select test.eq((select count(*) from invite_codes)::int, 0, 'membro comum não vê códigos de convite');

select set_config('request.jwt.claim.sub', :'caio', false) \gset
-- código formatado com hífen também funciona
select test.eq((select (join_republic(substr(:'code1', 1, 3) || '-' || substr(:'code1', 4)) ->> 'ok')::boolean), true,
  'caio entra digitando o código com hífen');
select test.eq((select count(*) from republic_members where republic_id = :'rid' and left_at is null)::int, 3,
  'república tem 3 membros');

-- força bruta: depois de 10 erros em 1h, bloqueia até o código certo
select set_config('request.jwt.claim.sub', :'duda', false) \gset
select join_republic(lpad(i::text, 7, '9')) from generate_series(1, 10) i \g /dev/null
select test.eq((select join_republic(:'code1') ->> 'error'), 'too_many_attempts', 'limite de tentativas erradas');

-- novo código revoga o anterior
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select code as code2 from generate_invite_code(:'rid', 30) \gset
select test.eq((select count(*) from invite_codes where revoked_at is null and expires_at > now())::int, 1,
  'só um código ativo por república');
select set_config('request.jwt.claim.sub', :'eva', false) \gset
select test.eq((select join_republic(:'code1') ->> 'error'), 'invalid_or_expired_code', 'código antigo deixa de valer');

-- código expirado não funciona
reset role;
update invite_codes set expires_at = now() - interval '1 second' where code = :'code2';
set role authenticated;
select test.eq((select join_republic(:'code2') ->> 'error'), 'invalid_or_expired_code', 'código expirado é recusado');

-- ---------- categorias ----------
select set_config('request.jwt.claim.sub', :'bia', false) \gset
select id as luz from bill_categories where republic_id = :'rid' and name = 'Luz' \gset
select test.throws(
  format($q$insert into bill_categories (republic_id, name, kind) values (%L, 'Netflix', 'fixed')$q$, :'rid'),
  'row-level security', 'membro comum não cria categoria');

select set_config('request.jwt.claim.sub', :'ana', false) \gset
insert into bill_categories (republic_id, name, kind, default_amount_cents)
values (:'rid', 'Netflix', 'fixed', 5590) returning id as netflix \gset
select test.throws(
  format($q$insert into bill_categories (republic_id, name, kind) values (%L, 'netflix', 'fixed')$q$, :'rid'),
  'duplicate key', 'não duplica nome de categoria (ignorando maiúsculas)');
select test.throws(
  format($q$insert into bill_categories (republic_id, name, kind, is_default) values (%L, 'X', 'fixed', true)$q$, :'rid'),
  'row-level security', 'categoria adicional não pode ser marcada como padrão');

-- ---------- contas ----------
select set_config('request.jwt.claim.sub', :'bia', false) \gset
select create_bill(:'rid', :'luz', 10000, '2026-11-15',
  format('[{"user_id":"%s","amount_cents":3334},{"user_id":"%s","amount_cents":3333},{"user_id":"%s","amount_cents":3333}]',
         :'ana', :'bia', :'caio')::jsonb,
  'equal', 'Conta de luz', null, :'bia') as bill1 \gset

select test.eq((select reference_month from bills where id = :'bill1'), '2026-11-01'::date,
  'mês de competência é normalizado para o dia 1');
select test.eq((select sum(amount_cents) from bill_shares where bill_id = :'bill1')::bigint, 10000::bigint,
  'partes somam o total');

select test.throws(format($q$select create_bill(%L, %L, 10000, '2026-11-01',
  '[{"user_id":"%s","amount_cents":5000}]'::jsonb)$q$, :'rid', :'luz', :'ana'),
  'shares_sum_mismatch', 'recusa partes que não somam o total');
select test.throws(format($q$select create_bill(%L, %L, 100, '2026-11-01',
  '[{"user_id":"%s","amount_cents":100}]'::jsonb)$q$, :'rid', :'luz', :'duda'),
  'invalid_participant', 'recusa participante que não é da república');
select test.throws(format($q$select create_bill(%L, %L, 100, '2026-11-01',
  '[{"user_id":"%s","amount_cents":50},{"user_id":"%s","amount_cents":50}]'::jsonb)$q$, :'rid', :'luz', :'ana', :'ana'),
  'duplicate_participant', 'recusa participante repetido');
select test.throws(format($q$select create_bill(%L, %L, 100, '2026-11-01',
  '[{"user_id":"%s","amount_cents":100}]'::jsonb, 'equal', null, null, %L)$q$, :'rid', :'luz', :'ana', :'duda'),
  'invalid_payer', 'recusa pagador de fora');
select test.throws(format($q$insert into bills (republic_id, category_id, amount_cents, reference_month, created_by)
  values (%L, %L, 1, '2026-11-01', %L)$q$, :'rid', :'luz', :'bia'),
  'row-level security', 'não dá para inserir conta sem passar pela validação');

select set_config('request.jwt.claim.sub', :'duda', false) \gset
select test.throws(format($q$select create_bill(%L, %L, 100, '2026-11-01',
  '[{"user_id":"%s","amount_cents":100}]'::jsonb)$q$, :'rid', :'luz', :'duda'),
  'forbidden', 'não-membro não lança conta');
select test.eq((select count(*) from bills)::int, 0, 'não-membro não vê contas');

-- acerto de partes
select set_config('request.jwt.claim.sub', :'caio', false) \gset
update bill_shares set settled_at = now() where bill_id = :'bill1' and user_id = :'caio';
select test.eq((select settled_at is not null from bill_shares where bill_id = :'bill1' and user_id = :'caio'), true,
  'morador marca a própria parte como acertada');
select test.throws(format('update bill_shares set amount_cents = 0 where bill_id = %L', :'bill1'),
  'permission denied', 'ninguém altera o valor de uma parte');

-- quem pagou
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select create_bill(:'rid', :'luz', 900, '2026-11-01',
  format('[{"user_id":"%s","amount_cents":300},{"user_id":"%s","amount_cents":300},{"user_id":"%s","amount_cents":300}]',
         :'ana', :'bia', :'caio')::jsonb) as bill_open \gset
select set_config('request.jwt.claim.sub', :'caio', false) \gset
select test.throws(format('select set_bill_payer(%L, %L)', :'bill_open', :'bia'), 'forbidden',
  'membro comum não marca outra pessoa como pagadora');
select set_bill_payer(:'bill_open', :'caio') \g /dev/null
select test.eq((select paid_by::text from bills where id = :'bill_open'), :'caio', 'morador marca "eu paguei"');
select set_config('request.jwt.claim.sub', :'bia', false) \gset
select test.throws(format('select set_bill_payer(%L, %L)', :'bill_open', :'bia'), 'forbidden',
  'não sobrescreve pagador já definido');
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select set_bill_payer(:'bill_open', null) \g /dev/null
select test.eq((select paid_by from bills where id = :'bill_open'), null::uuid, 'autor/admin pode limpar o pagador');
delete from bills where id = :'bill_open';

-- mais lançamentos para os relatórios
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select create_bill(:'rid', :'luz', 8000, '2026-10-01',
  format('[{"user_id":"%s","amount_cents":4000},{"user_id":"%s","amount_cents":4000}]', :'ana', :'bia')::jsonb,
  'equal', null, null, :'ana') \g /dev/null
select create_bill(:'rid', :'netflix', 5590, '2026-11-01',
  format('[{"user_id":"%s","amount_cents":5590}]', :'ana')::jsonb, 'custom') \g /dev/null

select test.eq(
  (select total_cents from v_monthly_category_totals where category_name = 'Luz' and reference_month = '2026-11-01')::bigint,
  10000::bigint, 'view: total de luz em novembro');
select test.eq(
  (select share_cents from v_monthly_member_totals where user_id = :'ana' and reference_month = '2026-11-01')::bigint,
  (3334 + 5590)::bigint, 'view: parte da ana em novembro');
select test.eq(
  (select paid_cents from v_monthly_member_totals where user_id = :'bia' and reference_month = '2026-11-01')::bigint,
  10000::bigint, 'view: bia pagou a luz de novembro');

select set_config('request.jwt.claim.sub', :'duda', false) \gset
select test.eq((select count(*) from v_monthly_member_totals)::int, 0, 'views respeitam o RLS');

-- ---------- papéis e saída ----------
select set_config('request.jwt.claim.sub', :'ana', false) \gset
select test.throws(format('select set_member_role(%L, %L, %L)', :'rid', :'ana', 'member'),
  'last_admin', 'não remove o último admin');
select set_member_role(:'rid', :'bia', 'admin') \g /dev/null

select set_config('request.jwt.claim.sub', :'bia', false) \gset
select test.eq((select count(*) from generate_invite_code(:'rid'))::int, 1, 'novo admin pode gerar código');

select set_config('request.jwt.claim.sub', :'caio', false) \gset
select test.throws(format('select remove_member(%L, %L)', :'rid', :'ana'), 'forbidden', 'membro comum não remove ninguém');
select remove_member(:'rid', :'caio') \g /dev/null
select test.eq((select count(*) from bills)::int, 0, 'quem saiu não vê mais as contas');

select set_config('request.jwt.claim.sub', :'ana', false) \gset
select test.eq((select left_at is not null from republic_members where user_id = :'caio'), true,
  'saída fica registrada (histórico preservado)');
select test.eq((select count(*) from bill_shares where user_id = :'caio')::int, 1,
  'partes antigas de quem saiu continuam no histórico');
select test.eq((select count(*) from profiles where id = :'caio')::int, 1,
  'nome de quem saiu continua visível no histórico');

-- apagar conta: autor ou admin
select set_config('request.jwt.claim.sub', :'ana', false) \gset
delete from bills where id = :'bill1';
select test.eq((select count(*) from bills where id = :'bill1')::int, 0, 'admin apaga conta');

\echo '\nTodos os testes do banco passaram.'
