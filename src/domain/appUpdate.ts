/**
 * Avisos de atualização: nova versão publicada (versao.json do site) e
 * base de alimentos que cresceu desde a última vez que o app foi aberto.
 */

export interface PublishedVersion {
  build: string;
  /** Versão exibida no app (ex.: "1.0.1"). */
  versao?: string;
  publicada_em?: string;
  gerado_em?: string;
  base_alimentos?: { atualizado_em: string; total: number };
}

export interface FoodBaseInfo {
  atualizado_em: string;
  total: number;
}

export interface UpdateNotice {
  kind: 'available' | 'applied';
  title: string;
  message: string;
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Há uma versão publicada diferente da que está rodando? */
export function availableUpdate(runningBuild: string | null, running: FoodBaseInfo, published: PublishedVersion | null): UpdateNotice | null {
  if (!runningBuild || !published?.build || published.build === runningBuild) return null;
  const remote = published.base_alimentos;
  const added = remote ? remote.total - running.total : 0;
  return {
    kind: 'available',
    title: added > 0 ? 'Atualizar base de dados' : 'Atualização disponível',
    message:
      added > 0
        ? `A base de alimentos ganhou ${plural(added, 'alimento novo', 'alimentos novos')} (total ${remote!.total}). Toque em Atualizar para baixar.`
        : `Há uma nova versão do app${published.versao ? ` (${published.versao})` : ''}. Toque em Atualizar para baixar.`,
  };
}

/** A base embutida mudou desde a última abertura (atualização já aplicada)? */
export function appliedFoodBaseUpdate(lastSeen: FoodBaseInfo | null, current: FoodBaseInfo): UpdateNotice | null {
  if (!lastSeen || lastSeen.atualizado_em === current.atualizado_em) return null;
  const added = current.total - lastSeen.total;
  return {
    kind: 'applied',
    title: 'Base de dados atualizada',
    message: added > 0 ? `${plural(added, 'alimento novo', 'alimentos novos')} na base (total ${current.total}).` : `A base de alimentos foi revisada (total ${current.total}).`,
  };
}

/** Resultado do "Verificar agora" na tela Sobre a versão. */
export function versionCheckResult(running: { version: string; build: string | null }, published: PublishedVersion | null): { status: 'offline' | 'current' | 'newer'; message: string } {
  if (!published) return { status: 'offline', message: 'Não foi possível consultar o servidor (sem internet?). Tente de novo mais tarde.' };
  const differs = published.build !== running.build || (published.versao !== undefined && published.versao !== running.version);
  if (!differs) return { status: 'current', message: 'Você já está na versão mais recente disponível no servidor.' };
  return { status: 'newer', message: `Nova versão encontrada${published.versao && published.versao !== running.version ? `: ${running.version} → ${published.versao}` : ''}. Atualizando…` };
}

/** "2026-10-25" → "25/10/2026". */
export function formatReleaseDate(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
