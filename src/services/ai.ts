/**
 * Cliente das funções de IA (Supabase Edge Functions). O app nunca contém
 * chaves de IA. Sem Supabase configurado, as funções retornam
 * `AiUnavailableError` e as telas oferecem o caminho manual/local.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import type {
  BioimpedanceExtraction,
  DietImport,
  LabelExtraction,
  MealParse,
} from '../../supabase/functions/_shared/schemas';
import { BioimpedanceExtractionSchema, DietImportSchema, LabelExtractionSchema, MealParseSchema } from '../../supabase/functions/_shared/schemas';
import { isCloudConfigured, supabase } from './supabase';

export type AiErrorCode =
  | 'local_mode'
  | 'ai_not_configured'
  | 'ai_consent_required'
  | 'ai_unavailable'
  | 'ai_rate_limited'
  | 'ai_refusal'
  | 'ai_invalid_output'
  | 'integration_not_configured'
  | 'integration_unavailable'
  | 'network'
  | 'unknown';

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: AiErrorCode,
  ) {
    super(message);
  }
}

export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  if (!isCloudConfigured) {
    throw new AiUnavailableError('Recursos de IA exigem a conta na nuvem (Supabase). No modo local, use o cadastro manual.', 'local_mode');
  }
  const { data, error } = await supabase().functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let payload: { error?: string; code?: AiErrorCode } = {};
      try {
        payload = await error.context.json();
      } catch {
        // corpo não-JSON
      }
      throw new AiUnavailableError(payload.error ?? 'Serviço indisponível no momento.', payload.code ?? 'unknown');
    }
    throw new AiUnavailableError('Sem conexão com o servidor. Verifique a internet e tente novamente.', 'network');
  }
  return data as T;
}

/** Valida a resposta mesmo vinda do nosso servidor (defesa em profundidade). */
function validated<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AiUnavailableError('A resposta da IA veio em formato inesperado.', 'ai_invalid_output');
  return r.data as T;
}

export async function aiParseMeal(text: string): Promise<MealParse> {
  return validated(MealParseSchema, await invokeFunction('ai-parse-meal', { text }));
}

export async function aiExtractLabel(storagePath: string): Promise<LabelExtraction> {
  return validated(LabelExtractionSchema, await invokeFunction('ai-extract-label', { storage_path: storagePath }));
}

export async function aiExtractBioimpedance(storagePath: string): Promise<BioimpedanceExtraction> {
  return validated(BioimpedanceExtractionSchema, await invokeFunction('ai-extract-bioimpedance', { storage_path: storagePath }));
}

export async function aiImportDiet(input: { text?: string | null; storage_path?: string | null }): Promise<DietImport> {
  return validated(DietImportSchema, await invokeFunction('ai-import-diet', input));
}

export async function aiChat(input: { conversation_id: string; message: string; context: Record<string, unknown> }): Promise<{ answer: string; meta: { model: string; food_sources: string[] } }> {
  return invokeFunction('ai-chat', input);
}

export async function deleteCloudAccount(): Promise<void> {
  await invokeFunction('delete-account', { confirm: 'EXCLUIR' });
}

export interface UsdaFood {
  id: string;
  name: string;
  data_type: string;
  per100: Record<string, number | null>;
  source: 'usda';
  source_ref: string;
}

export async function searchUsda(query: string): Promise<UsdaFood[]> {
  const r = await invokeFunction<{ foods: UsdaFood[] }>('food-search-usda', { query });
  return r.foods;
}
