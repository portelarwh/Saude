import { detectPlatform, installBannerMode } from '../installPrompt';

const base = { standalone: false, hasPrompt: false, isIos: false, isAndroid: false, dismissedAt: null, now: Date.UTC(2026, 9, 25) };

describe('sugestão de instalação', () => {
  it('não aparece dentro do app instalado', () => {
    expect(installBannerMode({ ...base, standalone: true, hasPrompt: true })).toBeNull();
  });
  it('usa o botão Instalar quando o Chrome libera', () => {
    expect(installBannerMode({ ...base, hasPrompt: true, isAndroid: true })).toBe('prompt');
  });
  it('mostra o passo a passo no iPhone e no Android sem pedido', () => {
    expect(installBannerMode({ ...base, isIos: true })).toBe('ios');
    expect(installBannerMode({ ...base, isAndroid: true })).toBe('android-manual');
    expect(installBannerMode(base)).toBeNull(); // computador
  });
  it('respeita "agora não" por 7 dias', () => {
    const day = 86_400_000;
    expect(installBannerMode({ ...base, hasPrompt: true, dismissedAt: base.now - 2 * day })).toBeNull();
    expect(installBannerMode({ ...base, hasPrompt: true, dismissedAt: base.now - 8 * day })).toBe('prompt');
  });
  it('reconhece a plataforma', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; SM-S911B) Chrome/130 Mobile')).toEqual({ isIos: false, isAndroid: true });
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari')).toEqual({ isIos: true, isAndroid: false });
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', 5).isIos).toBe(true); // iPad
  });
});
