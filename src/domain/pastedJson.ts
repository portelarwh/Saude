/**
 * Leitura de JSON colado de um assistente de IA externo (com ou sem bloco
 * ```json, texto em volta e vírgulas finais).
 */
/** Erro com mensagem amigável ao interpretar texto colado. */
export class PasteParseError extends Error {}

/** Extrai o primeiro objeto JSON de um texto colado (com ou sem bloco ```json). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    const raw = c.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'); // vírgulas finais
    try {
      return JSON.parse(raw);
    } catch {
      // tenta o próximo candidato
    }
  }
  throw new PasteParseError('Não encontramos um JSON válido na resposta colada. Peça à IA para responder apenas com o bloco JSON e cole novamente.');
}

function parseLoose(raw: string): unknown {
  return JSON.parse(raw.trim().replace(/,\s*([}\]])/g, '$1'));
}

/**
 * Todos os documentos JSON de um texto colado: vários blocos ```json,
 * uma lista [ {...}, {...} ] ou um único objeto.
 */
export function extractJsonDocuments(text: string): unknown[] {
  const out: unknown[] = [];
  const push = (v: unknown) => (Array.isArray(v) ? out.push(...v) : out.push(v));
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const f of fences) {
    try {
      push(parseLoose(f));
    } catch {
      // bloco inválido: ignorado aqui, avisado abaixo se nada for lido
    }
  }
  if (!out.length) {
    const t = text.trim();
    if (t.startsWith('[')) {
      try {
        push(parseLoose(t.slice(0, t.lastIndexOf(']') + 1)));
      } catch {
        // cai no objeto único
      }
    }
  }
  if (!out.length) push(extractJson(text));
  return out;
}
