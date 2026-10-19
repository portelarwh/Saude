/**
 * Rascunhos em memória passados entre telas (ex.: rótulo extraído pela IA ->
 * tela de conferência). Nunca persistidos: só viram dados após confirmação.
 */
const drafts = new Map<string, unknown>();

export function putDraft<T>(key: string, value: T): string {
  drafts.set(key, value);
  return key;
}

export function takeDraft<T>(key: string | undefined): T | null {
  if (!key) return null;
  const v = drafts.get(key) as T | undefined;
  return v ?? null;
}

export function dropDraft(key: string | undefined) {
  if (key) drafts.delete(key);
}
