-- "Como você está hoje?": registros de bem-estar (bem, barriga estufada, retenção de líquido).
-- Guarda também o que o app apontou como possíveis contribuições naquele momento.
create table public.wellbeing_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  logged_at timestamptz not null default now(),
  kind text not null check (kind in ('ok', 'bloating', 'fluid_retention')),
  intensity smallint check (intensity between 1 and 3),
  note text,
  contributors jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wellbeing_logs_user_date on public.wellbeing_logs (user_id, date);

create trigger wellbeing_logs_touch before update on public.wellbeing_logs for each row execute function public.touch_updated_at();

alter table public.wellbeing_logs enable row level security;
alter table public.wellbeing_logs force row level security;
create policy wellbeing_logs_owner on public.wellbeing_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wellbeing_logs to authenticated;
