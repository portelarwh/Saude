import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { HttpError } from './http.ts';

/** Modelo configurável por variável de ambiente (padrão: Claude Opus 5.5). */
export const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5';

/** Fallback no servidor quando o modelo recusa por política (escolha automática por categoria). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client: Anthropic | null = null;

export function claude(): Anthropic {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new HttpError(503, 'Inteligência artificial não configurada no servidor. Use o cadastro manual.', 'ai_not_configured');
  client ??= new Anthropic({ apiKey });
  return client;
}

export type UserContent = Anthropic.Beta.BetaContentBlockParam[];

export function fileBlock(base64: string, mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'): Anthropic.Beta.BetaContentBlockParam {
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

/** Converte erros do SDK em respostas HTTP compreensíveis. */
export function mapApiError(e: unknown): never {
  if (e instanceof HttpError) throw e;
  if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Muitas solicitações à IA. Aguarde um instante.', 'ai_rate_limited');
  if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'Credencial da IA inválida no servidor.', 'ai_not_configured');
  if (e instanceof Anthropic.BadRequestError) throw new HttpError(422, 'A IA não conseguiu processar este arquivo.', 'ai_bad_request');
  if (e instanceof Anthropic.APIConnectionError) throw new HttpError(503, 'Serviço de IA indisponível no momento.', 'ai_unavailable');
  if (e instanceof Anthropic.APIError) throw new HttpError(503, 'Serviço de IA indisponível no momento.', 'ai_unavailable');
  throw e;
}

/** Extração estruturada validada por esquema Zod. */
export async function extract<S extends z.ZodType>(schema: S, opts: { system: string; content: UserContent }): Promise<z.infer<S>> {
  try {
    const response = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: opts.system,
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      messages: [{ role: 'user', content: opts.content }],
    });
    if (response.stop_reason === 'refusal') throw new HttpError(422, 'A IA não pôde processar este conteúdo.', 'ai_refusal');
    if (response.stop_reason === 'max_tokens') throw new HttpError(422, 'Documento extenso demais para uma única leitura.', 'ai_truncated');
    if (!response.parsed_output) throw new HttpError(502, 'A IA retornou dados em formato inválido.', 'ai_invalid_output');
    return response.parsed_output as z.infer<S>;
  } catch (e) {
    mapApiError(e);
  }
}
