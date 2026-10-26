-- Treino de força (vezes por semana e duração) e padrão de proteína escolhido pelo usuário.
alter table public.profiles
  add column strength_sessions_per_week smallint check (strength_sessions_per_week between 0 and 14),
  add column strength_session_min smallint check (strength_session_min between 0 and 300),
  add column protein_g_per_kg numeric(3, 1) check (protein_g_per_kg between 1.0 and 2.5),
  add column protein_basis text check (protein_basis in ('reference', 'fat_free_mass', 'current'));

update public.profiles set strength_sessions_per_week = 0 where does_resistance_training = false;
