import type { Profile } from './types';

/**
 * Etapa em que o cadastro inicial deve abrir: a última salva, ou logo após o
 * consentimento (LGPD) se ele já foi dado — o termo só é pedido uma vez.
 */
export function resumeStep(p: Pick<Profile, 'onboarding_completed' | 'consent_health_data_at' | 'settings'> | null, total: number): number {
  if (!p || p.onboarding_completed) return 0;
  const saved = p.settings?.onboarding_step;
  if (typeof saved === 'number' && saved > 0) return Math.min(saved, total - 1);
  return p.consent_health_data_at ? 1 : 0;
}
