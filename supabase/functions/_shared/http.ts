export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/**
 * Envolve um handler com CORS e tratamento de erros. Os logs registram apenas
 * o tipo do erro e o nome da função — nunca o conteúdo de exames ou mensagens.
 */
export function handler(name: string, fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido', code: 'method' }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        console.warn(`[${name}] ${e.status} ${e.code}`);
        return json({ error: e.message, code: e.code }, e.status);
      }
      console.error(`[${name}] erro inesperado: ${(e as Error)?.name ?? 'Error'}`);
      return json({ error: 'Erro interno. Tente novamente.', code: 'internal' }, 500);
    }
  };
}

export async function readJson<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido', 'bad_json');
  }
  try {
    return parse(body);
  } catch {
    throw new HttpError(400, 'Parâmetros inválidos', 'bad_params');
  }
}
