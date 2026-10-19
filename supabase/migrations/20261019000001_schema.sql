-- Meu Equilíbrio — esquema principal
-- Todas as tabelas de dados pessoais têm user_id e Row Level Security:
-- cada usuário só lê e escreve as próprias linhas.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Perfil (1 linha por usuário; id = auth.users.id)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  birth_date date,
  sex text check (sex in ('female', 'male')),
  height_cm numeric(5, 1) check (height_cm between 50 and 260),
  current_weight_kg numeric(5, 1) check (current_weight_kg between 20 and 400),
  target_weight_kg numeric(5, 1) check (target_weight_kg between 20 and 400),
  waist_cm numeric(5, 1),
  hip_cm numeric(5, 1),
  other_measures jsonb,
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  work_routine text,
  does_resistance_training boolean,
  objective text check (objective in ('fat_loss', 'maintenance', 'recomposition', 'muscle_gain')),
  target_date date,
  wake_time text,
  sleep_time text,
  meal_times jsonb,
  food_preferences text,
  food_restrictions text[],
  allergies text[],
  intolerances text[],
  health_flags text[],
  health_notes text, -- dado sensível (LGPD art. 11)
  supplements_notes text,
  professional_guidance text,
  hot_climate boolean,
  water_ml_per_kg numeric(4, 1) check (water_ml_per_kg between 20 and 60),
  onboarding_completed boolean not null default false,
  consent_health_data_at timestamptz,
  consent_ai_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_owner check (id = user_id)
);

-- ---------------------------------------------------------------------------
-- Metas (versionadas: cada alteração cria uma nova linha)
-- ---------------------------------------------------------------------------
create table public.goal_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  valid_from timestamptz not null default now(),
  targets jsonb not null,
  calc jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goal_sets_user_valid on public.goal_sets (user_id, valid_from desc);

-- ---------------------------------------------------------------------------
-- Base de referência (TACO etc.) — leitura para usuários autenticados,
-- escrita somente pelo service role (importações).
-- ---------------------------------------------------------------------------
create table public.reference_foods (
  id text primary key,
  source text not null check (source in ('taco', 'tbca', 'usda', 'off')),
  name text not null,
  aliases text[] not null default '{}',
  category text,
  preparation_state text,
  base_unit text not null check (base_unit in ('g', 'ml')),
  per100 jsonb not null,
  trace_nutrients text[] not null default '{}',
  household_measures jsonb not null default '[]'::jsonb,
  verification text not null default 'reported' check (verification in ('verified', 'reported', 'estimated')),
  verified_at date,
  created_at timestamptz not null default now()
);
create index reference_foods_name_trgm on public.reference_foods using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Alimentos pessoais (rótulos, cadastros manuais, receitas, Open Food Facts)
-- ---------------------------------------------------------------------------
create table public.foods (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  brand text,
  flavor text,
  variant text,
  category text,
  preparation_state text,
  base_unit text not null check (base_unit in ('g', 'ml')),
  serving_size numeric,
  serving_label text,
  household_measures jsonb not null default '[]'::jsonb,
  per100 jsonb not null default '{}'::jsonb,
  trace_nutrients text[] not null default '{}',
  source text not null check (source in ('taco', 'tbca', 'usda', 'off', 'label', 'manual', 'recipe', 'ai_estimate')),
  source_ref text,
  verification text not null check (verification in ('verified', 'reported', 'estimated')),
  verified_at date,
  label_basis text check (label_basis in ('as_sold', 'prepared')),
  barcode text,
  ingredients_text text,
  is_supplement boolean not null default false,
  supplement_category text,
  compounds_per_serving jsonb,
  label_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index foods_user_name_trgm on public.foods using gin (name gin_trgm_ops);
create unique index foods_user_barcode on public.foods (user_id, barcode) where barcode is not null;

create table public.food_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, food_id)
);

-- ---------------------------------------------------------------------------
-- Diário alimentar (snapshot dos nutrientes preserva o histórico)
-- ---------------------------------------------------------------------------
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'extra')),
  custom_meal_name text,
  consumed_at timestamptz,
  food_id text not null,
  food_name text not null,
  amount numeric not null check (amount > 0),
  unit text not null check (unit in ('g', 'ml')),
  servings numeric,
  per100_snapshot jsonb not null,
  nutrients jsonb not null,
  compounds jsonb,
  source text not null,
  verification text not null,
  origin text not null,
  group_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index diary_entries_user_date on public.diary_entries (user_id, date);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  ingredients jsonb not null,
  final_weight_g numeric,
  servings numeric not null check (servings > 0),
  favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Hidratação
-- ---------------------------------------------------------------------------
create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  logged_at timestamptz not null,
  volume_ml integer not null check (volume_ml > 0 and volume_ml <= 3000),
  beverage text not null,
  container_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index water_logs_user_date on public.water_logs (user_id, date);

create table public.containers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  volume_ml integer not null check (volume_ml > 0 and volume_ml <= 3000),
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atividades, peso e composição corporal
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  started_at timestamptz not null,
  type text not null,
  custom_name text,
  duration_min integer not null check (duration_min > 0 and duration_min <= 1440),
  intensity text not null check (intensity in ('light', 'moderate', 'vigorous')),
  rpe smallint check (rpe between 1 and 10),
  distance_km numeric,
  notes text,
  kcal_estimated integer,
  kcal_source text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_user_date on public.activities (user_id, date);
create unique index activities_external on public.activities (user_id, source, external_id) where external_id is not null;

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5, 1) not null check (weight_kg between 20 and 400),
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.body_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  device_manufacturer text,
  device_model text,
  method text not null default 'bioimpedance',
  input text not null check (input in ('manual', 'import')),
  metrics jsonb not null,
  visceral_fat_scale text,
  segmental jsonb not null default '[]'::jsonb,
  other_metrics jsonb not null default '[]'::jsonb,
  conditions jsonb,
  file_path text,
  extraction_raw jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index body_assessments_user_date on public.body_assessments (user_id, measured_at);

-- ---------------------------------------------------------------------------
-- Notificações, planos alimentares e conversas
-- ---------------------------------------------------------------------------
create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  enabled boolean not null default false,
  times text[] not null default '{}',
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  interval_min integer check (interval_min is null or interval_min >= 30),
  window_start text,
  window_end text,
  quiet_start text,
  quiet_end text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

create table public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  origin text not null check (origin in ('professional', 'imported', 'generated', 'manual')),
  professional_name text,
  locked boolean not null default false,
  active boolean not null default false,
  meals jsonb not null,
  source_file_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_messages_conv on public.chat_messages (user_id, conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Rastreabilidade: histórico de alterações em dados críticos
-- (para o perfil guardamos apenas os nomes das colunas alteradas, sem valores
-- sensíveis, conforme o princípio da minimização da LGPD)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  row_id text not null,
  action text not null,
  changed_columns text[],
  old_row jsonb,
  at timestamptz not null default now()
);
create index audit_log_user on public.audit_log (user_id, at desc);

create or replace function public.audit_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed text[];
  old_json jsonb;
begin
  -- exclusão da conta (cascade): não há o que auditar
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at');
    if changed is null then
      return new;
    end if;
  end if;
  old_json := case when tg_table_name = 'profiles' or tg_op = 'INSERT' then null else to_jsonb(old) end;
  insert into public.audit_log (user_id, table_name, row_id, action, changed_columns, old_row)
  values (
    coalesce(new.user_id, old.user_id),
    tg_table_name,
    coalesce(new.id, old.id)::text,
    lower(tg_op),
    changed,
    old_json
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'goal_sets', 'foods', 'food_favorites', 'diary_entries', 'recipes', 'water_logs',
    'containers', 'activities', 'weight_entries', 'body_assessments', 'notification_settings', 'diet_plans', 'chat_messages']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['profiles', 'goal_sets', 'body_assessments', 'diet_plans']
  loop
    execute format('create trigger %I after update or delete on public.%I for each row execute function public.audit_changes()', t || '_audit', t);
  end loop;
end $$;

-- Dieta prescrita (bloqueada) não pode ter as refeições alteradas sem antes
-- ser desbloqueada explicitamente pelo próprio usuário.
create or replace function public.protect_locked_plan() returns trigger
language plpgsql as $$
begin
  if old.locked and new.locked and new.meals is distinct from old.meals then
    raise exception 'Plano prescrito bloqueado: desbloqueie antes de alterar as refeições' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger diet_plans_locked before update on public.diet_plans for each row execute function public.protect_locked_plan();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'goal_sets', 'foods', 'food_favorites', 'diary_entries', 'recipes', 'water_logs',
    'containers', 'activities', 'weight_entries', 'body_assessments', 'notification_settings', 'diet_plans', 'chat_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t || '_owner', t);
  end loop;
end $$;

alter table public.reference_foods enable row level security;
create policy reference_foods_read on public.reference_foods for select to authenticated using (true);

alter table public.audit_log enable row level security;
create policy audit_log_read_own on public.audit_log for select to authenticated using (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.reference_foods, public.audit_log from authenticated;
revoke all on all tables in schema public from anon;

-- Busca textual combinando base de referência e alimentos do usuário
create or replace function public.search_foods(q text, max_results int default 20)
returns table (id text, source text, name text, base_unit text, per100 jsonb, verification text, score real)
language sql stable security invoker set search_path = public as $$
  select * from (
    select r.id, r.source, r.name, r.base_unit, r.per100, r.verification,
           greatest(similarity(r.name, q), coalesce((select max(similarity(a, q)) from unnest(r.aliases) a), 0)) as score
    from public.reference_foods r
    where r.name ilike '%' || q || '%' or r.name % q or exists (select 1 from unnest(r.aliases) a where a ilike '%' || q || '%')
    union all
    select f.id, f.source, coalesce(f.name || coalesce(' (' || f.brand || ')', ''), f.name), f.base_unit, f.per100, f.verification,
           similarity(f.name, q) + 0.1 as score
    from public.foods f
    where f.user_id = (select auth.uid()) and (f.name ilike '%' || q || '%' or f.name % q or f.brand ilike '%' || q || '%')
  ) s
  order by score desc
  limit least(max_results, 50);
$$;
grant execute on function public.search_foods(text, int) to authenticated;
