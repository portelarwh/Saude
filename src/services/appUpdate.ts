/**
 * Verifica se há versão nova publicada (versao.json gerado no build web).
 * Só na versão web/PWA: o app Android instalado por APK é atualizado por nova instalação.
 */
import { Platform } from 'react-native';
import type { PublishedVersion } from '../domain/appUpdate';

function meta(name: string): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

/** Build em execução (null fora do build web publicado, ex.: desenvolvimento). */
export function runningBuild(): string | null {
  return meta('app-build');
}

export async function fetchPublishedVersion(): Promise<PublishedVersion | null> {
  if (!runningBuild()) return null;
  try {
    const res = await fetch(`${meta('app-base') ?? ''}/versao.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as PublishedVersion) : null;
  } catch {
    return null; // sem internet: tenta de novo depois
  }
}

const LAST_CHECK = 'me:last-version-check';

export function lastVersionCheck(): Date | null {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_CHECK) : null;
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function markVersionCheck(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_CHECK, new Date().toISOString());
  } catch {
    // sem armazenamento: só não mostra a última verificação
  }
}

/** Força a atualização: apaga os arquivos guardados do app e recarrega do servidor. Dados do usuário não são apagados. */
export async function forceUpdate(): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('meu-equilibrio')).map((k) => caches.delete(k)));
  } catch {
    // sem Cache API
  }
  const reg = await navigator.serviceWorker?.getRegistration?.();
  await reg?.update().catch(() => undefined);
  window.location.reload();
}

/** Recarrega para baixar a versão nova (páginas vêm da rede primeiro; o service worker troca o cache). */
export async function applyUpdate(): Promise<void> {
  if (Platform.OS !== 'web') return;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  await reg?.update().catch(() => undefined);
  window.location.reload();
}
