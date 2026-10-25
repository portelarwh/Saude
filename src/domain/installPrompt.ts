/** Quando e como sugerir a instalação do app (PWA) no topo da tela. */

export type InstallBannerMode = 'prompt' | 'ios' | 'android-manual';

export interface InstallContext {
  /** Já aberto como app instalado (tela cheia). */
  standalone: boolean;
  /** O Chrome liberou o pedido de instalação (beforeinstallprompt). */
  hasPrompt: boolean;
  isIos: boolean;
  isAndroid: boolean;
  dismissedAt: number | null;
  now: number;
}

export const DISMISS_DAYS = 7;

export function installBannerMode(c: InstallContext): InstallBannerMode | null {
  if (c.standalone) return null;
  if (c.dismissedAt && c.now - c.dismissedAt < DISMISS_DAYS * 86_400_000) return null;
  if (c.hasPrompt) return 'prompt';
  if (c.isIos) return 'ios';
  if (c.isAndroid) return 'android-manual';
  return null; // computador sem pedido de instalação: não insiste
}

export function detectPlatform(userAgent: string, maxTouchPoints = 0): { isIos: boolean; isAndroid: boolean } {
  const ua = userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1);
  return { isIos, isAndroid: /android/.test(ua) };
}

export const INSTALL_TEXT: Record<InstallBannerMode, { title: string; message: string; action: string | null }> = {
  prompt: { title: 'Instale o Meu Equilíbrio', message: 'Use como app no celular: ícone na tela inicial, tela cheia e funciona sem internet.', action: 'Instalar' },
  ios: { title: 'Instale o Meu Equilíbrio', message: 'No Safari, toque em Compartilhar (□↑) e depois em “Adicionar à Tela de Início”.', action: null },
  'android-manual': {
    title: 'Instale o Meu Equilíbrio',
    message: 'No Chrome, toque no menu ⋮ e em “Instalar app” (ou “Adicionar à tela inicial”). Se já instalou, abra pelo ícone na gaveta de apps.',
    action: null,
  },
};
