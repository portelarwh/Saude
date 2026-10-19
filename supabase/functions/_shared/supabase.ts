import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

/**
 * Cliente com o JWT do próprio usuário: todas as consultas passam pelas
 * políticas RLS, então a função só enxerga dados de quem a chamou.
 */
export async function userClient(req: Request): Promise<{ client: SupabaseClient; userId: string }> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado', 'unauthenticated');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) throw new HttpError(500, 'Servidor sem configuração do Supabase', 'server_config');
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(auth.slice('Bearer '.length));
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida', 'unauthenticated');
  return { client, userId: data.user.id };
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new HttpError(500, 'Servidor sem configuração do Supabase', 'server_config');
  return createClient(url, key, { auth: { persistSession: false } });
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

/** Baixa um arquivo do bucket privado (somente da pasta do usuário) em base64. */
export async function downloadUserFile(client: SupabaseClient, userId: string, path: string): Promise<{ base64: string; mediaType: AllowedType }> {
  if (!path.startsWith(`${userId}/`) || path.includes('..')) throw new HttpError(403, 'Arquivo não pertence ao usuário', 'forbidden');
  const { data, error } = await client.storage.from('health-files').download(path);
  if (error || !data) throw new HttpError(404, 'Arquivo não encontrado', 'file_not_found');
  const mediaType = data.type as AllowedType;
  if (!ALLOWED_TYPES.includes(mediaType)) throw new HttpError(415, 'Formato não suportado. Envie PDF, JPG, PNG ou WEBP.', 'unsupported_type');
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new HttpError(413, 'Arquivo maior que 20 MB', 'too_large');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return { base64: btoa(binary), mediaType };
}
