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

/** Recarrega para baixar a versão nova (páginas vêm da rede primeiro; o service worker troca o cache). */
export async function applyUpdate(): Promise<void> {
  if (Platform.OS !== 'web') return;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  await reg?.update().catch(() => undefined);
  window.location.reload();
}
