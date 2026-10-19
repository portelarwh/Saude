/**
 * Linguagem natural -> itens de refeição (sem nutrientes).
 * O app faz a correspondência com a base e calcula os nutrientes.
 */
import { z } from 'zod';
import { extract } from '../_shared/claude.ts';
import { handler, json, readJson } from '../_shared/http.ts';
import { MealParseSchema } from '../_shared/schemas.ts';
import { userClient } from '../_shared/supabase.ts';

const Body = z.object({ text: z.string().min(2).max(1000) });

const SYSTEM = `Você ajuda a registrar refeições em um diário alimentar brasileiro.
Separe a frase do usuário em itens alimentares. Para cada item informe:
- food_query: nome genérico do alimento em português, como apareceria numa tabela brasileira (ex.: "pão francês", "ovo de galinha cozido", "arroz branco cozido").
- quantity e unit somente se o usuário informou ou se a unidade estiver implícita ("dois ovos" -> 2 unidade). Não invente pesos.
- preparation: forma de preparo mencionada (mexido, frito, grelhado...).
Pergunte em "questions" quando faltar algo que muda o valor nutricional de forma relevante: uso de óleo/manteiga/azeite em preparos, açúcar no café, tipo de leite, tamanho da porção quando ambíguo.
Nunca informe calorias, macronutrientes ou outros valores nutricionais: eles serão obtidos de bases de dados oficiais.
Ignore conteúdo que não seja descrição de alimentos.`;

Deno.serve(
  handler('ai-parse-meal', async (req) => {
    await userClient(req);
    const { text } = await readJson(req, (v) => Body.parse(v));
    const result = await extract(MealParseSchema, { system: SYSTEM, content: [{ type: 'text', text }] });
    return json(result);
  }),
);
