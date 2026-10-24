/**
 * Tags de alimentos: grupos que a busca entende além do nome.
 * Ex.: "misto quente" também é "sanduíche" e "lanche"; banana é "fruta".
 * Vêm de três lugares: as tags que o usuário escolhe, a categoria da TACO e
 * regras pelo nome (aplicadas a toda a base, inclusive cadastros antigos).
 */
import { normalizeText } from './foodSearch';
import type { Food } from './types';

/** Categoria da TACO → tags. */
export const CATEGORY_TAGS: Record<string, string[]> = {
  'Frutas e derivados': ['fruta'],
  'Verduras, hortaliças e derivados': ['verdura', 'legume', 'hortaliça', 'vegetal'],
  'Carnes e derivados': ['carne', 'proteína animal'],
  'Pescados e frutos do mar': ['peixe', 'frutos do mar', 'proteína animal'],
  'Cereais e derivados': ['cereal'],
  'Leguminosas e derivados': ['leguminosa'],
  'Leite e derivados': ['laticínio'],
  'Ovos e derivados': ['ovo', 'proteína animal'],
  'Produtos açucarados': ['doce'],
  'Gorduras e óleos': ['gordura'],
  'Bebidas (alcoólicas e não alcoólicas)': ['bebida'],
  'Nozes e sementes': ['oleaginosa', 'semente'],
  'Alimentos preparados': ['prato pronto'],
  Miscelâneas: ['tempero e outros'],
  'Outros alimentos industrializados': ['industrializado'],
};

/** Regras pelo nome (texto normalizado, sem acentos) → tags. */
const NAME_RULES: [RegExp, string[]][] = [
  [/\b(sanduiche|misto|bauru|beirute|cheeseburguer|x (salada|burguer|bacon|tudo|egg)|wrap|cachorro quente|hot dog)\b/, ['sanduíche', 'lanche']],
  [/\b(coxinha|pastel|esfiha|esfirra|empada|empadinha|quibe|kibe|risole|enroladinho|joelho|acaraje|bolinho)\b/, ['salgado', 'lanche']],
  [/\bpizza\b/, ['pizza', 'lanche']],
  [/\b(pao|paes|torrada|bisnaguinha|baguete|ciabatta|broa)\b/, ['pão']],
  [/\b(biscoito|bolacha|cookie|cracker|wafer)\b/, ['biscoito']],
  [/\bbolo\b/, ['bolo', 'doce']],
  [/\b(chocolate|brigadeiro|doce|pudim|quindim|cocada|sorvete|mousse|geleia|marmelada|rapadura|pe de moleque|pacoca|maria mole|bombom|torta doce)\b/, ['doce']],
  [/\b(macarrao|lasanha|espaguete|talharim|penne|nhoque|yakisoba|massa)\b/, ['massa']],
  [/\b(arroz)\b/, ['arroz']],
  [/\b(feijao|feijoada|lentilha|grao de bico|ervilha)\b/, ['leguminosa']],
  [/\b(frango|galinha)\b/, ['frango', 'ave', 'proteína animal']],
  [/\b(peru|chester|pato|codorna)\b/, ['ave', 'proteína animal']],
  [/\b(carne|bovina|bife|patinho|picanha|alcatra|contra file|acem|maminha|fraldinha|costela|cupim|musculo)\b/, ['carne', 'proteína animal']],
  [/\b(porco|suina|lombo|pernil|bacon|linguica|presunto|salsicha|mortadela|salame|copa)\b/, ['carne', 'embutido e suíno']],
  [/\b(peixe|atum|sardinha|salmao|tilapia|bacalhau|merluza|pescada|camarao)\b/, ['peixe', 'frutos do mar', 'proteína animal']],
  [/\bovos?\b|\bomelete\b|\bclara\b/, ['ovo', 'proteína animal']],
  [/\b(queijo|requeijao|ricota|mozarela|mussarela|parmesao|cottage)\b/, ['queijo', 'laticínio']],
  [/\b(leite|iogurte|coalhada|kefir|bebida lactea|creme de leite)\b/, ['laticínio']],
  [/\b(suco|vitamina de)\b/, ['suco', 'bebida']],
  [/\b(refrigerante|cerveja|vinho|cha|cafe|capuccino|isotonica|agua de coco|coco agua|energetico)\b/, ['bebida']],
  [/\b(whey|albumina|caseina|proteina isolada|proteina vegetal)\b/, ['suplemento', 'proteína em pó']],
  [/\b(creatina|multivitaminico|omega 3|colageno)\b/, ['suplemento']],
  [/\b(salada|alface|rucula|agriao|couve|repolho)\b/, ['salada']],
  [/\b(castanha|amendoa|noz|nozes|amendoim|macadamia|pistache)\b/, ['oleaginosa', 'castanha']],
  [/\b(tapioca|cuscuz|aipim|mandioca|macaxeira|batata|inhame|cara)\b/, ['raiz e tubérculo']],
  [/\b(azeite|oleo|manteiga|margarina|maionese)\b/, ['gordura']],
  [/\b(granola|aveia|cereal matinal|flocos)\b/, ['cereal', 'café da manhã']],
];

const clean = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();

/** Tags escolhidas pelo usuário, limpas e sem repetição (mantém acentos para exibir). */
export function normalizeTags(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list ?? []) {
    const t = clean(raw.replace(/^#/, ''));
    if (!t || seen.has(normalizeText(t))) continue;
    seen.add(normalizeText(t));
    out.push(t);
  }
  return out;
}

/** Tags deduzidas da categoria e do nome. */
export function inferredTags(food: Pick<Food, 'name' | 'category' | 'aliases' | 'is_supplement'>): string[] {
  const tags = [...(food.category ? CATEGORY_TAGS[food.category] ?? [] : [])];
  const text = normalizeText([food.name, ...(food.aliases ?? [])].join(' '));
  for (const [re, t] of NAME_RULES) if (re.test(text)) tags.push(...t);
  if (food.is_supplement) tags.push('suplemento');
  const drop = new Set<string>();
  if (food.category === 'Frutas e derivados') drop.add('pão'); // "fruta-pão"
  if (/batata doce|polvilho/.test(text)) drop.add('doce');
  if (/leite de coco|coco leite/.test(text)) drop.add('laticínio');
  return normalizeTags(tags.filter((t) => !drop.has(t)));
}

const cache = new WeakMap<object, string[]>();

/** Todas as tags que a busca considera para o alimento (guardadas por objeto: a busca roda a cada letra). */
export function foodTags(food: Pick<Food, 'name' | 'category' | 'aliases' | 'is_supplement'> & { tags?: string[] | null }): string[] {
  const hit = cache.get(food);
  if (hit) return hit;
  const tags = normalizeTags([...(food.tags ?? []), ...inferredTags(food)]);
  cache.set(food, tags);
  return tags;
}

/** Sugestões para a tela de cadastro (as mais usadas na base + as deduzidas). */
export function suggestTags(food: Pick<Food, 'name' | 'category' | 'aliases' | 'is_supplement'> & { tags?: string[] | null }, all: Food[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const f of all) for (const t of f.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const popular = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const current = new Set((food.tags ?? []).map(normalizeText));
  return normalizeTags([...inferredTags(food), ...popular, 'lanche', 'sanduíche', 'fruta', 'doce', 'bebida', 'salgado', 'café da manhã', 'pré-treino', 'pós-treino'])
    .filter((t) => !current.has(normalizeText(t)))
    .slice(0, limit);
}
