-- Refeições salvas (montadas por agente de IA externo ou a partir do diário).
-- Cada item guarda o snapshot dos valores por 100 g/ml e a fonte
-- (TACO, rótulo, alimento do usuário ou estimativa externa marcada como tal).
create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  meal text check (meal in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'extra')),
  items jsonb not null,
  origin text not null default 'agent' check (origin in ('agent', 'diary', 'manual')),
  favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_meals_user on public.saved_meals (user_id, name);

create trigger saved_meals_touch before update on public.saved_meals for each row execute function public.touch_updated_at();

alter table public.saved_meals enable row level security;
alter table public.saved_meals force row level security;
create policy saved_meals_owner on public.saved_meals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.saved_meals to authenticated;
