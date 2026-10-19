/**
 * Exame de bioimpedância (PDF/imagem) -> indicadores estruturados para
 * conferência. Nada é salvo aqui: o app grava somente após o usuário revisar.
 */
import { z } from 'zod';
import { extract, fileBlock } from '../_shared/claude.ts';
import { handler, json, readJson } from '../_shared/http.ts';
import { BioimpedanceExtractionSchema } from '../_shared/schemas.ts';
import { downloadUserFile, userClient } from '../_shared/supabase.ts';

const Body = z.object({ storage_path: z.string().min(3) });

const SYSTEM = `Você transcreve laudos de bioimpedância e composição corporal (InBody, Tanita, Omron, Seca, Biodynamics, Sanny e outros).
Regras obrigatórias:
- Extraia SOMENTE indicadores impressos no documento, com o valor e a unidade exatamente como aparecem. Não calcule, não derive e não estime indicadores ausentes.
- Mapeie cada indicador para a chave correspondente: peso (weight_kg), IMC (bmi), massa de gordura (fat_mass_kg), percentual de gordura (body_fat_pct), massa livre de gordura / massa magra (fat_free_mass_kg), massa muscular esquelética (skeletal_muscle_mass_kg), massa muscular total (muscle_mass_kg), nível de gordura visceral (visceral_fat_level), água corporal total (total_body_water_l), água intracelular (intracellular_water_l), água extracelular (extracellular_water_l), relação AEC/ACT (ecw_tbw_ratio), taxa metabólica basal (bmr_kcal), ângulo de fase (phase_angle_deg), impedância (impedance_ohm), proteína (protein_kg), minerais (mineral_kg), circunferências (waist_cm, hip_cm).
- Se um valor estiver em unidade diferente da sugerida pela chave (ex.: lb), mantenha a unidade impressa no campo unit.
- Indicadores sem chave correspondente vão em other_metrics. Análise segmentar vai em segmental.
- Faixas de referência, metas e "valores ideais" do fabricante NÃO são medições: ignore-os.
- visceral_fat_scale: descreva a escala do fabricante se estiver impressa (ex.: "nível 1–20").
- measured_at: data da avaliação impressa (não a data de emissão, se diferentes). null se ausente.
- Registre em warnings qualquer dúvida de leitura, trecho ilegível ou múltiplas avaliações no mesmo arquivo.`;

Deno.serve(
  handler('ai-extract-bioimpedance', async (req) => {
    const { client, userId } = await userClient(req);
    const { storage_path } = await readJson(req, (v) => Body.parse(v));
    const file = await downloadUserFile(client, userId, storage_path);
    const result = await extract(BioimpedanceExtractionSchema, {
      system: SYSTEM,
      content: [fileBlock(file.base64, file.mediaType), { type: 'text', text: 'Transcreva os indicadores desta avaliação.' }],
    });
    return json(result);
  }),
);
