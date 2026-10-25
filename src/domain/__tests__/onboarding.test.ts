import { resumeStep } from '../onboarding';

const p = (o: Partial<{ onboarding_completed: boolean; consent_health_data_at: string | null; settings: { onboarding_step?: number } }>) => ({ onboarding_completed: false, consent_health_data_at: null, settings: {}, ...o });

describe('cadastro inicial retoma de onde parou', () => {
  it('primeira vez começa no consentimento (LGPD)', () => {
    expect(resumeStep(null, 7)).toBe(0);
    expect(resumeStep(p({}), 7)).toBe(0);
  });
  it('consentimento já dado não é pedido de novo', () => {
    expect(resumeStep(p({ consent_health_data_at: '2026-10-25T10:00:00Z' }), 7)).toBe(1);
  });
  it('volta para a etapa salva', () => {
    expect(resumeStep(p({ consent_health_data_at: 'x', settings: { onboarding_step: 4 } }), 7)).toBe(4);
    expect(resumeStep(p({ consent_health_data_at: 'x', settings: { onboarding_step: 99 } }), 7)).toBe(6);
  });
});
