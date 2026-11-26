-- =====================================================================
-- Repúblicas: schema inicial
-- Valores monetários em centavos (bigint). Mês de competência = 1º dia do mês.
-- Toda escrita sensível passa por funções RPC (security definer) que validam
-- permissões; as tabelas ficam protegidas por RLS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  created_at   timestamptz not null default now()
);

-- Cria o perfil automaticamente no cadastro (nome vem de options.data.display_name).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Repúblicas e membros
-- ---------------------------------------------------------------------
create table public.republics (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.republic_members (
  republic_id uuid not null references public.republics (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member')),
  joined_at   timestamptz not null default now(),
  -- Quem sai não é apagado: o histórico de gastos continua consistente.
  left_at     timestamptz,
  primary key (republic_id, user_id)
);
create index republic_members_user_idx on public.republic_members (user_id);

-- Funções auxiliares usadas nas políticas (security definer evita recursão de RLS).
create function public.is_member(p_republic_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from republic_members
    where republic_id = p_republic_id and user_id = auth.uid() and left_at is null
  );
$$;

create function public.is_admin(p_republic_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from republic_members
    where republic_id = p_republic_id and user_id = auth.uid() and left_at is null and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Convites: código numérico de 7 dígitos com validade
-- ---------------------------------------------------------------------
create table public.invite_codes (
  id          uuid primary key default gen_random_uuid(),
  republic_id uuid not null references public.republics (id) on delete cascade,
  code        char(7) not null check (code ~ '^[0-9]{7}$'),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  uses        integer not null default 0
);
create index invite_codes_code_idx on public.invite_codes (code);

-- Tentativas de entrada, para limitar força bruta nos códigos.
create table public.join_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  success      boolean not null
);
create index join_attempts_user_idx on public.join_attempts (user_id, attempted_at);

-- ---------------------------------------------------------------------
-- Categorias de conta (padrão + adicionais; fixas ou variáveis)
-- ---------------------------------------------------------------------
create table public.bill_categories (
  id                   uuid primary key default gen_random_uuid(),
  republic_id          uuid not null references public.republics (id) on delete cascade,
  name                 text not null check (char_length(trim(name)) between 1 and 40),
  kind                 text not null check (kind in ('fixed', 'variable')),
  -- true = criada automaticamente com a república; false = adicionada pelos moradores.
  is_default           boolean not null default false,
  -- Valor sugerido para contas fixas (ex.: aluguel), pré-preenchido no formulário.
  default_amount_cents bigint check (default_amount_cents > 0),
  archived_at          timestamptz,
  created_at           timestamptz not null default now()
);
create unique index bill_categories_name_uniq
  on public.bill_categories (republic_id, lower(name)) where archived_at is null;

-- Divisão padrão de cada categoria. Sem linhas = igual entre todos os membros ativos.
create table public.category_split_defaults (
  category_id uuid not null references public.bill_categories (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- null = divisão igual entre os listados; preenchido = percentual (somando 100).
  percentage  numeric(5, 2) check (percentage > 0 and percentage <= 100),
  primary key (category_id, user_id)
);

-- ---------------------------------------------------------------------
-- Contas (lançamentos) e partes de cada morador
-- ---------------------------------------------------------------------
create table public.bills (
  id              uuid primary key default gen_random_uuid(),
  republic_id     uuid not null references public.republics (id) on delete cascade,
  category_id     uuid not null references public.bill_categories (id),
  description     text check (char_length(description) <= 120),
  amount_cents    bigint not null check (amount_cents > 0),
  reference_month date not null check (extract(day from reference_month) = 1),
  due_date        date,
  paid_by         uuid references public.profiles (id),
  split_mode      text not null default 'equal' check (split_mode in ('equal', 'percentage', 'custom')),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index bills_republic_month_idx on public.bills (republic_id, reference_month);
create index bills_category_idx on public.bills (category_id);

create table public.bill_shares (
  bill_id      uuid not null references public.bills (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents >= 0),
  -- Preenchido quando a pessoa acerta sua parte com quem pagou.
  settled_at   timestamptz,
  primary key (bill_id, user_id)
);
create index bill_shares_user_idx on public.bill_shares (user_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles                enable row level security;
alter table public.republics               enable row level security;
alter table public.republic_members        enable row level security;
alter table public.invite_codes            enable row level security;
alter table public.join_attempts           enable row level security;
alter table public.bill_categories         enable row level security;
alter table public.category_split_defaults enable row level security;
alter table public.bills                   enable row level security;
alter table public.bill_shares             enable row level security;

-- Perfis: vejo o meu e o de quem mora (ou morou) comigo.
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.republic_members mine
    join public.republic_members other on other.republic_id = mine.republic_id
    where mine.user_id = auth.uid() and mine.left_at is null and other.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy republics_select on public.republics for select using (public.is_member(id));
create policy republics_update on public.republics for update using (public.is_admin(id)) with check (public.is_admin(id));

-- Membros: alterações só via RPC (set_member_role, remove_member, leave_republic, join_republic).
create policy members_select on public.republic_members for select using (public.is_member(republic_id));

-- Convites: só admins veem; criação via generate_invite_code.
create policy invites_select on public.invite_codes for select using (public.is_admin(republic_id));
create policy invites_update on public.invite_codes for update using (public.is_admin(republic_id)) with check (public.is_admin(republic_id));

-- join_attempts: sem políticas = inacessível pelo cliente.

create policy categories_select on public.bill_categories for select using (public.is_member(republic_id));
create policy categories_insert on public.bill_categories for insert with check (public.is_admin(republic_id) and not is_default);
create policy categories_update on public.bill_categories for update using (public.is_admin(republic_id)) with check (public.is_admin(republic_id));

create policy split_defaults_select on public.category_split_defaults for select using (
  exists (select 1 from public.bill_categories c where c.id = category_id and public.is_member(c.republic_id))
);
create policy split_defaults_write on public.category_split_defaults for all using (
  exists (select 1 from public.bill_categories c where c.id = category_id and public.is_admin(c.republic_id))
) with check (
  exists (select 1 from public.bill_categories c where c.id = category_id and public.is_admin(c.republic_id))
);

-- Contas: qualquer membro vê; criação via create_bill; apaga quem criou ou admin.
create policy bills_select on public.bills for select using (public.is_member(republic_id));
create policy bills_delete on public.bills for delete using (
  public.is_admin(republic_id) or (created_by = auth.uid() and public.is_member(republic_id))
);

create policy shares_select on public.bill_shares for select using (
  exists (select 1 from public.bills b where b.id = bill_id and public.is_member(b.republic_id))
);
-- Marcar como acertado: a própria pessoa, quem pagou a conta, ou admin.
create policy shares_update on public.bill_shares for update using (
  exists (
    select 1 from public.bills b
    where b.id = bill_id and public.is_member(b.republic_id)
      and (bill_shares.user_id = auth.uid() or b.paid_by = auth.uid() or public.is_admin(b.republic_id))
  )
);
-- Só a coluna settled_at pode ser alterada pelo cliente.
revoke update on public.bill_shares from anon, authenticated;
grant update (settled_at) on public.bill_shares to authenticated;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Cria a república, torna o criador admin e semeia as contas padrão.
create function public.create_republic(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  insert into republics (name, created_by) values (trim(p_name), auth.uid()) returning id into v_id;
  insert into republic_members (republic_id, user_id, role) values (v_id, auth.uid(), 'admin');

  insert into bill_categories (republic_id, name, kind, is_default) values
    (v_id, 'Aluguel',            'fixed',    true),
    (v_id, 'Condomínio',         'fixed',    true),
    (v_id, 'Internet',           'fixed',    true),
    (v_id, 'Luz',                'variable', true),
    (v_id, 'Água',               'variable', true),
    (v_id, 'Gás',                'variable', true),
    (v_id, 'Mercado',            'variable', true),
    (v_id, 'Produtos de limpeza','variable', true);

  return v_id;
end;
$$;

-- Gera um código de 7 dígitos (revoga o anterior). Somente admin.
create function public.generate_invite_code(p_republic_id uuid, p_ttl_minutes integer default 1440)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_code text;
  v_expires timestamptz := now() + make_interval(mins => p_ttl_minutes);
begin
  if not is_admin(p_republic_id) then raise exception 'forbidden'; end if;
  if p_ttl_minutes < 5 or p_ttl_minutes > 10080 then raise exception 'invalid_ttl'; end if;

  -- Serializa a geração para não haver dois códigos ativos iguais.
  perform pg_advisory_xact_lock(hashtext('invite_codes'));

  update invite_codes set revoked_at = now()
  where republic_id = p_republic_id and revoked_at is null and invite_codes.expires_at > now();

  loop
    -- Aleatoriedade criptográfica (pgcrypto), não random().
    v_code := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 10000000)::text, 7, '0');
    exit when not exists (
      select 1 from invite_codes i
      where i.code = v_code and i.revoked_at is null and i.expires_at > now()
    );
  end loop;

  insert into invite_codes (republic_id, code, created_by, expires_at)
  values (p_republic_id, v_code, auth.uid(), v_expires);

  return query select v_code, v_expires;
end;
$$;

-- Entra numa república com o código. Retorna jsonb {ok, republic_id | error}
-- (não lança exceção em código inválido para que a tentativa fique registrada).
create function public.join_republic(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code   text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_invite invite_codes%rowtype;
  v_failed integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select count(*) into v_failed from join_attempts
  where user_id = auth.uid() and not success and attempted_at > now() - interval '1 hour';
  if v_failed >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select * into v_invite from invite_codes
  where code = v_code and revoked_at is null and expires_at > now()
  order by created_at desc limit 1;

  if not found then
    insert into join_attempts (user_id, success) values (auth.uid(), false);
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  insert into republic_members (republic_id, user_id, role)
  values (v_invite.republic_id, auth.uid(), 'member')
  on conflict (republic_id, user_id) do update
    set left_at = null,
        -- quem volta entra como membro comum; quem já está ativo mantém o papel
        role = case when republic_members.left_at is null then republic_members.role else 'member' end,
        joined_at = case when republic_members.left_at is null then republic_members.joined_at else now() end;

  update invite_codes set uses = uses + 1 where id = v_invite.id;
  insert into join_attempts (user_id, success) values (auth.uid(), true);

  return jsonb_build_object('ok', true, 'republic_id', v_invite.republic_id);
end;
$$;

-- Lança uma conta com a divisão já calculada no app (o banco valida tudo de novo).
-- p_shares: [{"user_id": "...", "amount_cents": 1234}, ...]
create function public.create_bill(
  p_republic_id     uuid,
  p_category_id     uuid,
  p_amount_cents    bigint,
  p_reference_month date,
  p_shares          jsonb,
  p_split_mode      text default 'equal',
  p_description     text default null,
  p_due_date        date default null,
  p_paid_by         uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_bill_id uuid;
  v_sum     bigint;
  v_count   integer;
  v_valid   integer;
begin
  if not is_member(p_republic_id) then raise exception 'forbidden'; end if;

  if not exists (
    select 1 from bill_categories
    where id = p_category_id and republic_id = p_republic_id and archived_at is null
  ) then raise exception 'invalid_category'; end if;

  if p_paid_by is not null and not exists (
    select 1 from republic_members where republic_id = p_republic_id and user_id = p_paid_by and left_at is null
  ) then raise exception 'invalid_payer'; end if;

  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'invalid_shares';
  end if;

  select coalesce(sum((s ->> 'amount_cents')::bigint), 0),
         count(*),
         count(distinct (s ->> 'user_id'))
    into v_sum, v_count, v_valid
  from jsonb_array_elements(p_shares) s;

  if v_valid <> v_count then raise exception 'duplicate_participant'; end if;
  if v_sum <> p_amount_cents then raise exception 'shares_sum_mismatch'; end if;

  select count(*) into v_valid
  from jsonb_array_elements(p_shares) s
  join republic_members m
    on m.republic_id = p_republic_id and m.user_id = (s ->> 'user_id')::uuid and m.left_at is null
  where (s ->> 'amount_cents')::bigint >= 0;
  if v_valid <> v_count then raise exception 'invalid_participant'; end if;

  insert into bills (
    republic_id, category_id, description, amount_cents, reference_month,
    due_date, paid_by, split_mode, created_by
  ) values (
    p_republic_id, p_category_id, nullif(trim(p_description), ''), p_amount_cents,
    date_trunc('month', p_reference_month)::date, p_due_date, p_paid_by, p_split_mode, auth.uid()
  ) returning id into v_bill_id;

  insert into bill_shares (bill_id, user_id, amount_cents)
  select v_bill_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint
  from jsonb_array_elements(p_shares) s;

  return v_bill_id;
end;
$$;

-- Define quem pagou uma conta já lançada.
-- Qualquer morador pode marcar a si mesmo; admin ou quem lançou pode marcar qualquer morador (ou limpar).
create function public.set_bill_payer(p_bill_id uuid, p_paid_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bill bills%rowtype;
begin
  select * into v_bill from bills where id = p_bill_id;
  if not found or not is_member(v_bill.republic_id) then raise exception 'forbidden'; end if;

  if not (
    is_admin(v_bill.republic_id)
    or v_bill.created_by = auth.uid()
    or (p_paid_by = auth.uid() and v_bill.paid_by is null)
  ) then raise exception 'forbidden'; end if;

  if p_paid_by is not null and not exists (
    select 1 from republic_members where republic_id = v_bill.republic_id and user_id = p_paid_by and left_at is null
  ) then raise exception 'invalid_payer'; end if;

  update bills set paid_by = p_paid_by where id = p_bill_id;
  -- Mudou o pagador: acertos anteriores deixam de valer.
  if p_paid_by is distinct from v_bill.paid_by then
    update bill_shares set settled_at = null where bill_id = p_bill_id;
  end if;
end;
$$;

-- Promove/rebaixa membro. Não deixa a república sem admin.
create function public.set_member_role(p_republic_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_republic_id) then raise exception 'forbidden'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;

  if p_role = 'member' and (
    select count(*) from republic_members
    where republic_id = p_republic_id and role = 'admin' and left_at is null and user_id <> p_user_id
  ) = 0 then raise exception 'last_admin'; end if;

  update republic_members set role = p_role
  where republic_id = p_republic_id and user_id = p_user_id and left_at is null;
end;
$$;

-- Remove um morador (admin) ou sai da república (o próprio usuário).
create function public.remove_member(p_republic_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin(p_republic_id) or (p_user_id = auth.uid() and is_member(p_republic_id))) then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1 from republic_members
    where republic_id = p_republic_id and user_id = p_user_id and role = 'admin' and left_at is null
  ) and (
    select count(*) from republic_members
    where republic_id = p_republic_id and role = 'admin' and left_at is null
  ) = 1 and (
    select count(*) from republic_members
    where republic_id = p_republic_id and left_at is null
  ) > 1 then
    raise exception 'last_admin';
  end if;

  update republic_members set left_at = now(), role = 'member'
  where republic_id = p_republic_id and user_id = p_user_id and left_at is null;

  -- Sai das divisões padrão das categorias.
  delete from category_split_defaults d
  using bill_categories c
  where d.category_id = c.id and c.republic_id = p_republic_id and d.user_id = p_user_id;
end;
$$;

-- Apenas usuários logados podem chamar as RPCs.
revoke execute on function
  public.create_republic(text),
  public.generate_invite_code(uuid, integer),
  public.join_republic(text),
  public.create_bill(uuid, uuid, bigint, date, jsonb, text, text, date, uuid),
  public.set_bill_payer(uuid, uuid),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid)
from public, anon;
grant execute on function
  public.create_republic(text),
  public.generate_invite_code(uuid, integer),
  public.join_republic(text),
  public.create_bill(uuid, uuid, bigint, date, jsonb, text, text, date, uuid),
  public.set_bill_payer(uuid, uuid),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid)
to authenticated;

-- =====================================================================
-- Views de relatório (respeitam o RLS de quem consulta)
-- =====================================================================
create view public.v_monthly_category_totals with (security_invoker = true) as
select
  b.republic_id,
  b.reference_month,
  c.id   as category_id,
  c.name as category_name,
  c.kind,
  sum(b.amount_cents) as total_cents,
  count(*)            as bills_count
from public.bills b
join public.bill_categories c on c.id = b.category_id
group by b.republic_id, b.reference_month, c.id, c.name, c.kind;

create view public.v_monthly_member_totals with (security_invoker = true) as
with shares as (
  select b.republic_id, b.reference_month, s.user_id, sum(s.amount_cents) as share_cents
  from public.bills b join public.bill_shares s on s.bill_id = b.id
  group by 1, 2, 3
), paid as (
  select b.republic_id, b.reference_month, b.paid_by as user_id, sum(b.amount_cents) as paid_cents
  from public.bills b where b.paid_by is not null
  group by 1, 2, 3
)
select
  coalesce(s.republic_id, p.republic_id)         as republic_id,
  coalesce(s.reference_month, p.reference_month) as reference_month,
  coalesce(s.user_id, p.user_id)                 as user_id,
  coalesce(s.share_cents, 0)                     as share_cents,
  coalesce(p.paid_cents, 0)                      as paid_cents
from shares s
full outer join paid p
  on p.republic_id = s.republic_id and p.reference_month = s.reference_month and p.user_id = s.user_id;
