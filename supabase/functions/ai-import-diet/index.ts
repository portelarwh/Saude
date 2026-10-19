/**
 * Plano alimentar (texto, foto ou PDF) -> refeições, opções e itens.
 * As alternativas ("ou", "opção 1/2", "substituições") são separadas em
 * opções, para que o app não as some como se fossem simultâneas.
 */
import { z } from 'zod';
import { extract, fileBlock, type UserContent } from '../_shared/claude.ts';
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { DietImportSchema } from '../_shared/schemas.ts';
import { downloadUserFile, userClient } from '../_shared/supabase.ts';

const Body = z.object({
  text: z.string().max(20000).nullable().optional(),
  storage_path: z.string().nullable().optional(),
});

const SYSTEM = `Você transcreve planos alimentares (dietas) escritos por nutricionistas ou pelo próprio usuário.
Regras:
- Separe cada refeição com nome, horário (HH:MM, se houver) e tipo (breakfast, morning_snack, lunch, afternoon_snack, dinner, supper ou extra).
- Alternativas mutuamente exclusivas ("ou", "opção 1 / opção 2", "substituir por", listas de substituição) devem virar OPÇÕES separadas da mesma refeição. Itens que são consumidos juntos ficam na mesma opção.
- Para cada item: nome do alimento, quantidade e unidade exatamente como escritas (ex.: 2 "fatias", 100 "g", 1 "concha"). Não converta nem estime quantidades ausentes.
- Não acrescente alimentos, não calcule calorias e não faça recomendações.
- professional_name: nome do profissional, se constar.
- notes: orientações gerais do plano (ex.: "beber 2 L de água").`;

Deno.serve(
  handler('ai-import-diet', async (req) => {
    const { client, userId } = await userClient(req);
    const body = await readJson(req, (v) => Body.parse(v));
    const content: UserContent = [];
    if (body.storage_path) {
      const file = await downloadUserFile(client, userId, body.storage_path);
      content.push(fileBlock(file.base64, file.mediaType));
    }
    if (body.text) content.push({ type: 'text', text: `Plano alimentar:\n${body.text}` });
    if (!content.length) throw new HttpError(400, 'Envie um texto ou um arquivo', 'bad_params');
    content.push({ type: 'text', text: 'Transcreva o plano alimentar.' });
    return json(await extract(DietImportSchema, { system: SYSTEM, content }));
  }),
);
