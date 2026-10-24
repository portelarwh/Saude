-- Mais de um objetivo por perfil (ex.: emagrecer + ganhar massa muscular).
-- `objective` continua sendo o objetivo usado no cálculo das metas.
alter table public.profiles
  add column objectives text[] not null default '{}'
    check (objectives <@ array['fat_loss', 'maintenance', 'recomposition', 'muscle_gain']::text[]);

update public.profiles set objectives = array[objective] where objective is not null;
