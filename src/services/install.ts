/**
 * Instalação como app (PWA). O index.html guarda o pedido de instalação do
 * Chrome (beforeinstallprompt) antes do app carregar: ver scripts/pwa-postbuild.js.
 */
import { Platform } from 'react-native';
import { detectPlatform, type InstallContext } from '../domain/installPrompt';

interface DeferredPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type W = Window & { __mePrompt?: DeferredPrompt | null };

const KEY = 'me:install-dismissed-at';
const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

export function installContext(): InstallContext | null {
  if (!isWeb()) return null;
  let dismissedAt: number | null = null;
  try {
    dismissedAt = Number(window.localStorage.getItem(KEY)) || null;
  } catch {
    // sem armazenamento (aba anônima): mostra de novo na próxima vez
  }
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { standalone, hasPrompt: Boolean((window as W).__mePrompt), ...detectPlatform(navigator.userAgent, navigator.maxTouchPoints), dismissedAt, now: Date.now() };
}

export function dismissInstall(): void {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignora
  }
}

/** Abre a janela de instalação do Chrome; true se o usuário aceitou. */
export async function promptInstall(): Promise<boolean> {
  const p = (window as W).__mePrompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  (window as W).__mePrompt = null;
  return outcome === 'accepted';
}

/** Avisa quando o pedido de instalação chega ou o app é instalado. */
export function onInstallChange(cb: () => void): () => void {
  if (!isWeb()) return () => undefined;
  window.addEventListener('me-installable', cb);
  window.addEventListener('appinstalled', cb);
  return () => {
    window.removeEventListener('me-installable', cb);
    window.removeEventListener('appinstalled', cb);
  };
}
