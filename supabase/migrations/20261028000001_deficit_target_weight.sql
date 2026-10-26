-- Ritmo do emagrecimento (déficit de 10, 15 ou 20%) e base "peso-alvo" para a proteína.
-- A base "massa livre de gordura" sai da proteína (o g/kg vale para o peso corporal);
-- a massa magra continua sendo usada no metabolismo de repouso.
alter table public.profiles add column deficit_pct smallint check (deficit_pct in (10, 15, 20));

update public.profiles set protein_basis = null where protein_basis = 'fat_free_mass';
alter table public.profiles drop constraint if exists profiles_protein_basis_check;
alter table public.profiles add constraint profiles_protein_basis_check check (protein_basis in ('reference', 'target_weight', 'current'));
