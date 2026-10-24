-- Tags de alimentos (grupos para a busca): "misto quente" também é "sanduíche".
-- No app as tags também são deduzidas pela categoria e pelo nome (src/domain/foodTags.ts);
-- aqui a base de referência recebe as tags da categoria para a busca do assistente.
alter table public.foods add column tags text[] not null default '{}';
alter table public.reference_foods add column tags text[] not null default '{}';

create or replace function public.category_tags(category text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce((select c.tags from (values
  ('Frutas e derivados', array['fruta']),
  ('Verduras, hortaliças e derivados', array['verdura', 'legume', 'hortaliça', 'vegetal']),
  ('Carnes e derivados', array['carne', 'proteína animal']),
  ('Pescados e frutos do mar', array['peixe', 'frutos do mar', 'proteína animal']),
  ('Cereais e derivados', array['cereal']),
  ('Leguminosas e derivados', array['leguminosa']),
  ('Leite e derivados', array['laticínio']),
  ('Ovos e derivados', array['ovo', 'proteína animal']),
  ('Produtos açucarados', array['doce']),
  ('Gorduras e óleos', array['gordura']),
  ('Bebidas (alcoólicas e não alcoólicas)', array['bebida']),
  ('Nozes e sementes', array['oleaginosa', 'semente']),
  ('Alimentos preparados', array['prato pronto']),
  ('Miscelâneas', array['tempero e outros']),
  ('Outros alimentos industrializados', array['industrializado'])
) as c(category, tags) where c.category = $1), '{}');
$$;

-- a semente da TACO roda depois das migrações: as tags entram na inserção
create or replace function public.reference_foods_tags() returns trigger language plpgsql set search_path = public as $$
begin
  if new.tags is null or new.tags = '{}' then new.tags := public.category_tags(new.category); end if;
  return new;
end $$;
create trigger reference_foods_tags before insert or update on public.reference_foods
  for each row execute function public.reference_foods_tags();
update public.reference_foods set tags = public.category_tags(category);

create or replace function public.search_foods(q text, max_results int default 20)
returns table (id text, source text, name text, base_unit text, per100 jsonb, verification text, score real)
language sql stable security invoker set search_path = public as $$
  select * from (
    select r.id, r.source, r.name, r.base_unit, r.per100, r.verification,
           greatest(similarity(r.name, q), coalesce((select max(similarity(a, q)) from unnest(r.aliases || r.tags) a), 0)) as score
    from public.reference_foods r
    where r.name ilike '%' || q || '%' or r.name % q
       or exists (select 1 from unnest(r.aliases || r.tags) a where a ilike '%' || q || '%' or a % q)
    union all
    select f.id, f.source, coalesce(f.name || coalesce(' (' || f.brand || ')', ''), f.name), f.base_unit, f.per100, f.verification,
           greatest(similarity(f.name, q), coalesce((select max(similarity(a, q)) from unnest(f.aliases || f.tags) a), 0)) + 0.1 as score
    from public.foods f
    where f.user_id = (select auth.uid())
      and (f.name ilike '%' || q || '%' or f.name % q or f.brand ilike '%' || q || '%'
           or exists (select 1 from unnest(f.aliases || f.tags) a where a ilike '%' || q || '%' or a % q))
  ) s
  order by score desc
  limit least(max_results, 50);
$$;
