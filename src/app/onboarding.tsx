/**
 * Assistente de configuração inicial. Apenas os dados essenciais para as
 * fórmulas são solicitados; tudo pode ser editado depois em Perfil.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACTIVITY_FACTORS, bmi, bmiCategory } from '../domain/energy';
import { assessTimeline, calculateGoals, GOAL_KEYS, GOAL_LABELS } from '../domain/goals';
import { formatDateBR, isValidTime, parseBRDate } from '../domain/dates';
import { defaultSettings } from '../domain/notifications';
import type { BodyAssessment, Container, NotificationSetting, Profile, Sex, WeightEntry } from '../domain/types';
import { useApp, useStore } from '../state/AppProvider';
import { emptyProfile, useGoals, useProfile } from '../state/hooks';
import { recalculateGoals } from '../services/goalsService';
import { Button, Card, ChipSelect, Field, MultiChipSelect, Notice, NumberField, ProgressBar, Row, Screen, T, Toggle } from '../ui/components';
import { num } from '../ui/format';
import { ACTIVITY_OPTIONS, HEALTH_FLAGS, OBJECTIVES, RESTRICTIONS } from '../ui/labels';
import { spacing, useTheme } from '../ui/theme';

const STEPS = ['Boas-vindas', 'Dados corporais', 'Rotina e objetivo', 'Horários', 'Alimentação', 'Saúde', 'Suas metas'];





export default function Onboarding() {
  const router = useRouter();
  const store = useStore();
  const { mode } = useApp();
  const { colors } = useTheme();
  const { profile: saved, save } = useProfile();
  const { goalSet } = useGoals();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Omit<Profile, 'id' | 'user_id' | 'created_at'>>(() => ({ ...emptyProfile(), ...(saved ?? {}) }));
  const [birthText, setBirthText] = useState(saved?.birth_date ? formatDateBR(saved.birth_date) : '');
  const [targetDateText, setTargetDateText] = useState(saved?.target_date ? formatDateBR(saved.target_date) : '');
  const [consentHealth, setConsentHealth] = useState(Boolean(saved?.consent_health_data_at));
  const [consentAi, setConsentAi] = useState(Boolean(saved?.consent_ai_at));
  const [allergiesText, setAllergiesText] = useState((saved?.allergies ?? []).join(', '));
  const [intolerancesText, setIntolerancesText] = useState((saved?.intolerances ?? []).join(', '));
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((cur) => ({ ...cur, [k]: v }));

  // Ao voltar da importação de bioimpedância, aproveita o peso medido.
  useFocusEffect(
    useCallback(() => {
      store.list<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: false }, limit: 1 }).then((list) => {
        const a = list[0];
        const w = a?.metrics.weight_kg;
        if (a && w && w.unit.toLowerCase() === 'kg') {
          setP((cur) => (cur.current_weight_kg ? cur : { ...cur, current_weight_kg: w.value }));
          setImportedFrom(`${a.device_model ?? 'avaliação'} de ${formatDateBR(a.measured_at)}`);
        }
      });
    }, [store]),
  );

  const preview = useMemo(() => {
    const birth = parseBRDate(birthText);
    const target_date = parseBRDate(targetDateText);
    return calculateGoals({ profile: { ...p, birth_date: birth, target_date } });
  }, [p, birthText, targetDateText]);

  const timeline = p.current_weight_kg && p.target_weight_kg ? assessTimeline(p.current_weight_kg, p.target_weight_kg, parseBRDate(targetDateText)) : null;

  const validate = (): string | null => {
    if (step === 0 && !consentHealth) return 'Para usar o app, é necessário autorizar o tratamento dos dados de saúde informados.';
    if (step === 1) {
      if (!p.name.trim()) return 'Informe seu nome.';
      if (birthText && !parseBRDate(birthText)) return 'Data de nascimento inválida (use DD/MM/AAAA).';
      if (!p.height_cm || p.height_cm < 100 || p.height_cm > 250) return 'Informe a altura em centímetros (ex.: 165).';
      if (!p.current_weight_kg || p.current_weight_kg < 30 || p.current_weight_kg > 350) return 'Informe o peso atual em kg.';
    }
    if (step === 2 && targetDateText && !parseBRDate(targetDateText)) return 'Prazo inválido (use DD/MM/AAAA).';
    if (step === 3) {
      for (const t of [p.wake_time, p.sleep_time]) if (t && !isValidTime(t)) return 'Use horários no formato HH:MM.';
    }
    return null;
  };

  const next = () => {
    const e = validate();
    setError(e);
    if (!e) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const splitList = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);
      const profile = await save({
        ...p,
        name: p.name.trim(),
        birth_date: parseBRDate(birthText),
        target_date: parseBRDate(targetDateText),
        allergies: splitList(allergiesText),
        intolerances: splitList(intolerancesText),
        consent_health_data_at: saved?.consent_health_data_at ?? now,
        consent_ai_at: consentAi ? saved?.consent_ai_at ?? now : null,
        onboarding_completed: true,
      });
      await recalculateGoals(store, profile, goalSet, 'Metas iniciais');
      if (!saved?.onboarding_completed) {
        if (p.current_weight_kg) await store.insert<WeightEntry>('weight_entries', { measured_at: now, weight_kg: p.current_weight_kg, source: 'manual', note: 'Peso inicial' });
        const existing = await store.list<NotificationSetting>('notification_settings');
        if (!existing.length) await store.insertMany<NotificationSetting>('notification_settings', defaultSettings());
        const containers = await store.list<Container>('containers');
        if (!containers.length) {
          await store.insertMany<Container>('containers', [
            { name: 'Copo', volume_ml: 200, icon: 'water-outline' },
            { name: 'Garrafa', volume_ml: 500, icon: 'flask-outline' },
            { name: 'Caneca', volume_ml: 300, icon: 'cafe-outline' },
          ]);
        }
      }
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const bmiValue = p.current_weight_kg && p.height_cm ? bmi(p.current_weight_kg, p.height_cm) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <T variant="small">{`Etapa ${step + 1} de ${STEPS.length} · ${STEPS[step]}`}</T>
        <ProgressBar pct={((step + 1) / STEPS.length) * 100} height={6} label="Progresso do cadastro" />
      </View>
      <Screen
        footer={
          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.bg }}>
            {step > 0 ? <Button title="Voltar" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
            {step < STEPS.length - 1 ? (
              <Button title={step >= 3 && step <= 5 ? 'Continuar (opcional)' : 'Continuar'} onPress={next} style={{ flex: 2 }} />
            ) : (
              <Button title="Concluir" icon="checkmark" onPress={finish} loading={busy} style={{ flex: 2 }} />
            )}
          </View>
        }
      >
        {error ? <Notice kind="error">{error}</Notice> : null}

        {step === 0 && (
          <>
            <T variant="h1">Bem-vindo ao Meu Equilíbrio</T>
            <T>
              Vamos configurar seu acompanhamento: perda de gordura com preservação de massa muscular, proteína, hidratação e atividade física. Leva cerca de 3 minutos e só pedimos o essencial.
            </T>
            {mode === 'local' ? (
              <Notice kind="info" title="Modo local">
                Seus dados ficam apenas neste aparelho. Recursos de IA e backup na nuvem exigem configurar o Supabase (veja a documentação do projeto).
              </Notice>
            ) : null}
            <Card>
              <T variant="h3">Privacidade (LGPD)</T>
              <T variant="small">
                Informações de saúde são dados pessoais sensíveis. Elas são usadas apenas para calcular suas metas e acompanhar sua evolução, não são compartilhadas com outros usuários e podem ser exportadas ou excluídas a qualquer momento em Perfil › Privacidade.
              </T>
              <Toggle label="Autorizo o tratamento dos meus dados de saúde para este acompanhamento" value={consentHealth} onChange={setConsentHealth} />
              <Toggle
                label="Autorizo a IA a ler meus registros para responder no chat e interpretar arquivos (opcional)"
                description="Os arquivos e dados são enviados ao provedor de IA apenas quando você usa esses recursos. Você pode revogar depois."
                value={consentAi}
                onChange={setConsentAi}
              />
            </Card>
            <T variant="tiny">O app oferece orientações gerais e estimativas. Ele não substitui médico ou nutricionista e não faz diagnósticos.</T>
          </>
        )}

        {step === 1 && (
          <>
            <T variant="h2">Sobre você</T>
            <Card>
              <T variant="h3">Tem um exame de bioimpedância?</T>
              <T variant="small">Envie o PDF ou foto: a IA extrai os valores, você confere e eles complementam seu perfil.</T>
              {importedFrom ? <Notice kind="success">{`Peso importado da ${importedFrom}. Confira abaixo.`}</Notice> : null}
              <Button
                variant="secondary"
                icon="document-attach-outline"
                title={mode === 'cloud' ? 'Importar bioimpedância' : 'Registrar avaliação manualmente'}
                onPress={() => router.push('/composicao/nova')}
              />
            </Card>
            <Field label="Nome" value={p.name} onChangeText={(t) => set('name', t)} autoComplete="name" />
            <Field label="Data de nascimento" value={birthText} onChangeText={setBirthText} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" hint="Usada na equação de metabolismo basal" />
            <ChipSelect<Sex>
              label="Sexo biológico (usado apenas nas equações)"
              options={[{ value: 'female', label: 'Feminino' }, { value: 'male', label: 'Masculino' }]}
              value={p.sex}
              onChange={(v) => set('sex', v)}
            />
            <Row>
              <NumberField label="Altura" suffix="cm" value={p.height_cm} onChange={(v) => set('height_cm', v)} style={{ flex: 1 }} />
              <NumberField label="Peso atual" suffix="kg" value={p.current_weight_kg} onChange={(v) => set('current_weight_kg', v)} style={{ flex: 1 }} />
            </Row>
            {bmiValue ? <T variant="small">{`IMC ${num(bmiValue, 1)} · ${bmiCategory(bmiValue)} (o IMC é um indicador populacional e não avalia composição corporal)`}</T> : null}
            <NumberField label="Peso desejado (opcional)" suffix="kg" value={p.target_weight_kg} onChange={(v) => set('target_weight_kg', v)} />
            <Row>
              <NumberField label="Cintura (opcional)" suffix="cm" value={p.waist_cm} onChange={(v) => set('waist_cm', v)} style={{ flex: 1 }} />
              <NumberField label="Quadril (opcional)" suffix="cm" value={p.hip_cm} onChange={(v) => set('hip_cm', v)} style={{ flex: 1 }} />
            </Row>
          </>
        )}

        {step === 2 && (
          <>
            <T variant="h2">Rotina e objetivo</T>
            <ChipSelect label="Objetivo" options={OBJECTIVES} value={p.objective} onChange={(v) => set('objective', v)} />
            <ChipSelect label="Nível de atividade física" options={ACTIVITY_OPTIONS} value={p.activity_level} onChange={(v) => set('activity_level', v)} />
            {p.activity_level ? <T variant="small">{ACTIVITY_FACTORS[p.activity_level].description}</T> : null}
            <Toggle label="Faço treino de força (musculação ou similar)" value={Boolean(p.does_resistance_training)} onChange={(v) => set('does_resistance_training', v)} />
            <Field label="Rotina de trabalho (opcional)" value={p.work_routine ?? ''} onChangeText={(t) => set('work_routine', t)} placeholder="Ex.: escritório, 8h às 17h; turnos; home office" />
            <Field label="Prazo desejado (opcional)" value={targetDateText} onChangeText={setTargetDateText} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
            {timeline && timeline.status !== 'not_applicable' ? (
              <Notice kind={timeline.status === 'ok' ? 'success' : timeline.status === 'aggressive' ? 'warning' : 'error'} title="Viabilidade do prazo">
                {timeline.message}
              </Notice>
            ) : timeline?.suggestedWeeks ? (
              <T variant="small">{timeline.message}</T>
            ) : null}
          </>
        )}

        {step === 3 && (
          <>
            <T variant="h2">Horários habituais</T>
            <T variant="small">Usados para lembretes e para distribuir a meta de água ao longo do dia.</T>
            <Row>
              <Field label="Acordo às" value={p.wake_time ?? ''} onChangeText={(t) => set('wake_time', t)} placeholder="07:00" style={{ flex: 1 }} />
              <Field label="Durmo às" value={p.sleep_time ?? ''} onChangeText={(t) => set('sleep_time', t)} placeholder="23:00" style={{ flex: 1 }} />
            </Row>
            {(['breakfast', 'lunch', 'afternoon_snack', 'dinner'] as const).map((m) => (
              <Field
                key={m}
                label={{ breakfast: 'Café da manhã', lunch: 'Almoço', afternoon_snack: 'Lanche da tarde', dinner: 'Jantar' }[m]}
                value={p.meal_times?.[m] ?? ''}
                onChangeText={(t) => set('meal_times', { ...(p.meal_times ?? {}), [m]: t })}
                placeholder="HH:MM"
              />
            ))}
          </>
        )}

        {step === 4 && (
          <>
            <T variant="h2">Alimentação</T>
            <MultiChipSelect label="Restrições e padrões" options={RESTRICTIONS.map((r) => ({ value: r, label: r }))} value={p.food_restrictions ?? []} onChange={(v) => set('food_restrictions', v)} />
            <Field label="Alergias" value={allergiesText} onChangeText={setAllergiesText} placeholder="Ex.: amendoim, camarão" hint="Separe por vírgulas" />
            <Field label="Intolerâncias" value={intolerancesText} onChangeText={setIntolerancesText} placeholder="Ex.: lactose" />
            <Field label="Preferências" value={p.food_preferences ?? ''} onChangeText={(t) => set('food_preferences', t)} placeholder="Alimentos de que gosta, o que costuma comer, orçamento" multiline />
          </>
        )}

        {step === 5 && (
          <>
            <T variant="h2">Saúde (opcional e protegido)</T>
            <T variant="small">Essas informações tornam as sugestões mais seguras. Em algumas condições, o app não sugere metas automáticas e recomenda acompanhamento profissional.</T>
            <MultiChipSelect label="Condições de saúde" options={HEALTH_FLAGS} value={p.health_flags ?? []} onChange={(v) => set('health_flags', v)} />
            <Field label="Observações de saúde" value={p.health_notes ?? ''} onChangeText={(t) => set('health_notes', t)} multiline placeholder="Medicamentos relevantes, cirurgias, etc." />
            <Field label="Suplementos que usa" value={p.supplements_notes ?? ''} onChangeText={(t) => set('supplements_notes', t)} placeholder="Ex.: whey, creatina 3 g" />
            <Field label="Orientações de médico ou nutricionista" value={p.professional_guidance ?? ''} onChangeText={(t) => set('professional_guidance', t)} multiline />
            <Toggle label="Moro em região de clima quente" value={Boolean(p.hot_climate)} onChange={(v) => set('hot_climate', v)} />
          </>
        )}

        {step === 6 && (
          <>
            <T variant="h2">Suas metas iniciais</T>
            <T variant="small">Metas orientativas calculadas com equações reconhecidas. Você pode ajustá-las ou registrar metas prescritas por profissional — estas têm prioridade e nunca são alteradas automaticamente.</T>
            {preview.missingData.length ? <Notice kind="warning">{`Dados faltantes para algumas metas: ${preview.missingData.join(', ')}.`}</Notice> : null}
            {GOAL_KEYS.map((k) => {
              const t = preview.targets[k];
              return (
                <Card key={k}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T variant="h3">{GOAL_LABELS[k].label}</T>
                    <T variant="h3" color={colors.primary}>{t.value !== null ? `${num(t.value)} ${GOAL_LABELS[k].unit}` : 'não definida'}</T>
                  </Row>
                  <T variant="small">{t.explanation}</T>
                  {t.warnings?.map((w) => <Notice key={w} kind="warning">{w}</Notice>)}
                </Card>
              );
            })}
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}
