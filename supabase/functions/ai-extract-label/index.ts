/**
 * Foto/PDF de rótulo -> tabela nutricional estruturada para conferência.
 */
import { z } from 'zod';
import { extract, fileBlock } from '../_shared/claude.ts';
import { handler, json, readJson } from '../_shared/http.ts';
import { LabelExtractionSchema } from '../_shared/schemas.ts';
import { downloadUserFile, userClient } from '../_shared/supabase.ts';

const Body = z.object({ storage_path: z.string().min(3) });

const SYSTEM = `Você transcreve tabelas de informação nutricional de rótulos brasileiros (RDC ANVISA 429/2020 e modelos anteriores).
Regras:
- Transcreva somente o que está legível no rótulo. Campo ausente ou ilegível = null e liste-o em unreadable_fields. Nunca estime nem complete com conhecimento próprio.
- Preencha per_100 com a coluna "100 g" ou "100 ml" e per_serving com a coluna da porção, quando existirem.
- serving_size e serving_unit: porção declarada (ex.: 30 g, 200 ml). household_measure: medida caseira (ex.: "1 dosador", "2 colheres de sopa").
- basis: "prepared" se a tabela se refere ao produto preparado (ex.: com leite), "as_sold" se ao produto como vendido, "unknown" se não for possível saber.
- Valor energético: use kcal em energy_kcal e kJ em energy_kj.
- Sódio em mg. "Zero"/"0" = 0. "Não contém quantidade significativa" = 0 apenas se o rótulo disser isso explicitamente.
- Suplementos: is_supplement=true e categoria adequada. Compostos ativos (creatina, cafeína, beta-alanina, colágeno etc.) vão em compounds_per_serving com a quantidade por porção; creatina NÃO é proteína.
- confidence: "low" se a foto estiver borrada, cortada ou com reflexo.`;

Deno.serve(
  handler('ai-extract-label', async (req) => {
    const { client, userId } = await userClient(req);
    const { storage_path } = await readJson(req, (v) => Body.parse(v));
    const file = await downloadUserFile(client, userId, storage_path);
    const result = await extract(LabelExtractionSchema, {
      system: SYSTEM,
      content: [fileBlock(file.base64, file.mediaType), { type: 'text', text: 'Transcreva a tabela nutricional e os dados do produto.' }],
    });
    return json(result);
  }),
);
