-- Simula o mínimo do Supabase (schema auth, roles e auth.uid()) num Postgres puro,
-- para testar a migration sem precisar do Supabase rodando.
-- NÃO aplicar em produção: no Supabase tudo isso já existe.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- No Supabase, auth.uid() lê o "sub" do JWT. Aqui lemos de uma configuração de sessão.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Privilégios padrão parecidos com os do Supabase para o schema public.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
