/**
 * Painel inicial. Proteína e água em destaque; "sem registros" é exibido
 * como tal (nunca como zero).
 */
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, timeToMinutes } from '../../domain/dates';
import { proteinMessage, summarizeDay } from '../../domain/daySummary';
import { hydrationNudge, QUICK_VOLUMES_ML, summarizeHydration } from '../../domain/hydration';
import { trend } from '../../domain/bodyComposition';
import { NOTIFICATION_LABELS } from '../../domain/notifications';
import { MEAL_LABELS, type ActivityLog, type BodyAssessment, type DiaryEntry, type MealType, type NotificationSetting, type WaterLog, type WeightEntry } from '../../domain/types';
import { useStore } from '../../state/AppProvider';
import { useCollection, useCountedBeverages, useGoals, useProfile, useToday } from '../../state/hooks';
import { Badge, Button, Card, Notice, ProgressBar, Row, Screen, SectionHeader, T } from '../../ui/components';
import { Ring } from '../../ui/charts';
import { ml, num, signed } from '../../ui/format';
import { QuickAdd } from '../../ui/QuickAdd';
import { spacing, useTheme } from '../../ui/theme';

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const weekAgo = addDays(today, -6);
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', weekAgo] });
  const water = useCollection<WaterLog>('water_logs', { gte: ['date', weekAgo] });
  const activities = useCollection<ActivityLog>('activities', { gte: ['date', weekAgo] });
  const weights = useCollection<WeightEntry>('weight_entries', { order: { field: 'measured_at', ascending: true } });
  const assessments = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: true } });
  const notifications = useCollection<NotificationSetting>('notification_settings');
  const counted = useCountedBeverages(profile);
  const goals = goalSet?.targets ?? null;

  const day = useMemo(
    () => summarizeDay({ date: today, entries: entries.data, waterLogs: water.data, activities: activities.data, goals, countedBeverages: counted }),
    [today, entries.data, water.data, activities.data, goals, counted],
  );
  const nudge = hydrationNudge(day.hydration, new Date(), profile?.wake_time ?? undefined, profile?.sleep_time ?? undefined);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekAgo, i));
    const foodDays = days.filter((d) => entries.data.some((e) => e.date === d)).length;
    const waterMet = days.filter((d) => {
      const s = summarizeHydration(d, water.data, goals?.water_ml.value ?? null, counted);
      return s.goal_ml && s.counted_ml >= s.goal_ml;
    }).length;
    const activeDays = new Set(activities.data.map((a) => a.date)).size;
    return { foodDays, waterMet, activeDays };
  }, [weekAgo, entries.data, water.data, activities.data, goals, counted]);

  const firstWeight = weights.data[0]?.weight_kg ?? null;
  const lastWeight = weights.data[weights.data.length - 1]?.weight_kg ?? profile?.current_weight_kg ?? null;
  const fatTrend = trend(assessments.data, 'fat_mass_kg', 90);
  const muscleTrend = trend(assessments.data, assessments.data.some((a) => a.metrics.skeletal_muscle_mass_kg) ? 'skeletal_muscle_mass_kg' : 'fat_free_mass_kg', 90);

  const next = nextReminder(profile?.meal_times ?? null, notifications.data);

  const addWater = async (v: number) => {
    const now = new Date();
    await store.insert<WaterLog>('water_logs', { date: today, logged_at: now.toISOString(), volume_ml: v, beverage: 'water', container_id: null });
  };

  const trendText = (t: ReturnType<typeof trend>, unit: string) => {
    if (t.direction === 'insufficient') return 'São necessárias 2+ avaliações em 90 dias';
    const word = t.direction === 'down' ? 'queda' : t.direction === 'up' ? 'alta' : 'estável';
    return `${word} (${signed(t.change, 1)} ${unit})${t.consistent ? ' · consistente' : ''}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View>
          <T variant="h2">{profile?.name ? `Olá, ${profile.name.split(' ')[0]}` : 'Olá'}</T>
          <T variant="small">{formatDateBR(today)}</T>
        </View>

        {!goals ? (
          <Notice kind="warning" title="Metas não definidas" action={<Button small title="Definir metas" onPress={() => router.push('/metas')} />}>
            Complete seu perfil para calcular metas orientativas.
          </Notice>
        ) : null}

        <Row gap={spacing.md} style={{ alignItems: 'stretch' }}>
          <Card style={{ flex: 1, alignItems: 'center' }} onPress={() => router.push('/(tabs)/alimentacao')} accessibilityLabel="Proteína do dia">
            <T variant="label">Proteína</T>
            <Ring pct={day.protein.pct} color={colors.chart.primary} label={day.protein.consumed === null ? 'Proteína: sem registros hoje' : `Proteína: ${Math.round(day.protein.consumed)} de ${day.protein.target ?? '?'} gramas`}>
              <T variant="h2">{day.protein.consumed === null ? '—' : num(day.protein.consumed)}</T>
              <T variant="tiny">{day.protein.target ? `de ${num(day.protein.target)} g` : 'sem meta'}</T>
            </Ring>
            <T variant="small" style={{ textAlign: 'center' }}>
              {day.protein.consumed === null ? 'Sem registros' : day.protein.remaining !== null ? `Faltam ${num(day.protein.remaining)} g` : ''}
            </T>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }} onPress={() => router.push('/agua')} accessibilityLabel="Hidratação do dia">
            <T variant="label">Água</T>
            <Ring pct={day.water.pct} color={colors.chart.water} label={day.water.consumed === null ? 'Água: sem registros hoje' : `Água: ${day.water.consumed} de ${day.water.target ?? '?'} mililitros`}>
              <T variant="h2">{day.water.consumed === null ? '—' : ml(day.water.consumed)}</T>
              <T variant="tiny">{day.water.target ? `de ${ml(day.water.target)}` : 'sem meta'}</T>
            </Ring>
            <T variant="small" style={{ textAlign: 'center' }}>
              {day.water.consumed === null ? 'Sem registros' : day.water.remaining !== null ? `Faltam ${ml(day.water.remaining)}` : ''}
            </T>
          </Card>
        </Row>

        <Row wrap>
          {QUICK_VOLUMES_ML.filter((v) => [200, 250, 500].includes(v)).map((v) => (
            <Button key={v} small variant="water" icon="water" title={`+${v} ml`} onPress={() => addWater(v)} accessibilityLabel={`Adicionar ${v} mililitros de água`} />
          ))}
          <Button small variant="secondary" icon="flask-outline" title="Suplemento" onPress={() => router.push('/suplementos')} />
        </Row>

        {nudge.message ? <Notice kind={nudge.behind ? 'info' : 'success'}>{nudge.message}</Notice> : null}
        {goals?.protein_g.value && day.protein.consumed !== null && (day.protein.remaining ?? 0) > 0 ? <Notice kind="info">{proteinMessage(day.protein)!}</Notice> : null}

        <Card onPress={() => router.push('/(tabs)/alimentacao')} accessibilityLabel="Resumo de calorias e macronutrientes">
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">Calorias e macros</T>
            {day.partial.length ? <Badge label="parcial" tone="warning" /> : null}
          </Row>
          {!day.hasFoodRecords ? (
            <T variant="small">Nenhuma refeição registrada hoje. Os totais aparecerão aqui após o primeiro registro.</T>
          ) : null}
          {([
            ['Calorias', day.energy, 'kcal', colors.chart.accent],
            ['Carboidratos', day.carbs, 'g', colors.chart.primary],
            ['Gorduras', day.fat, 'g', colors.chart.primary],
            ['Fibras', day.fiber, 'g', colors.chart.primary],
          ] as const).map(([label, p, unit, color]) => (
            <View key={label} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="small">{label}</T>
                <T variant="small">{`${p.consumed === null ? '—' : num(p.consumed)} / ${p.target ? num(p.target) : '—'} ${unit}${p.pct !== null ? ` · ${Math.round(p.pct)}%` : ''}`}</T>
              </Row>
              <ProgressBar pct={p.pct} color={color} height={8} label={label} />
            </View>
          ))}
          {day.partial.length ? <T variant="tiny">Alguns alimentos não têm todos os nutrientes informados na fonte; os totais podem estar subestimados.</T> : null}
        </Card>

        <Row gap={spacing.md} style={{ alignItems: 'stretch' }}>
          <Card style={{ flex: 1 }} onPress={() => router.push('/(tabs)/atividades')}>
            <T variant="label">Atividades hoje</T>
            <T variant="h2">{day.activities.count ? `${day.activities.minutes} min` : '—'}</T>
            <T variant="small">{day.activities.count ? `${day.activities.count} registro(s)` : 'Nenhuma registrada'}</T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="label">Próximo lembrete</T>
            <T variant="h3">{next ? next.time : '—'}</T>
            <T variant="small">{next ? next.label : 'Configure em Perfil › Notificações'}</T>
          </Card>
        </Row>

        <SectionHeader title="Evolução" action={<Button small variant="ghost" title="Ver tudo" onPress={() => router.push('/(tabs)/evolucao')} />} />
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T variant="label">Peso atual</T>
              <T variant="h2">{lastWeight ? `${num(lastWeight, 1)} kg` : '—'}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="label">Desde o início</T>
              <T variant="h3">{firstWeight && lastWeight ? `${signed(lastWeight - firstWeight, 1)} kg` : '—'}</T>
              <T variant="tiny">{profile?.target_weight_kg ? `Meta: ${num(profile.target_weight_kg, 1)} kg` : 'Sem meta de peso'}</T>
            </View>
          </Row>
          <T variant="small">{`Gordura corporal (90 dias): ${trendText(fatTrend, 'kg')}`}</T>
          <T variant="small">{`Massa muscular (90 dias): ${trendText(muscleTrend, 'kg')}`}</T>
        </Card>
        <Card>
          <T variant="label">Últimos 7 dias</T>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="Dias com registro alimentar" value={`${week.foodDays}/7`} />
            <Stat label="Meta de água atingida" value={`${week.waterMet}/7`} />
            <Stat label="Dias ativos" value={`${week.activeDays}/7`} />
          </Row>
        </Card>
      </Screen>
      <QuickAdd />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T variant="h3">{value}</T>
      <T variant="tiny" style={{ textAlign: 'center' }}>{label}</T>
    </View>
  );
}

function nextReminder(mealTimes: Partial<Record<MealType, string>> | null, settings: NotificationSetting[]): { time: string; label: string } | null {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const candidates: { time: string; label: string }[] = [];
  for (const s of settings) {
    if (!s.enabled || !s.weekdays.includes(now.getDay())) continue;
    for (const t of s.times) candidates.push({ time: t, label: NOTIFICATION_LABELS[s.kind] });
  }
  if (!candidates.length && mealTimes) {
    for (const [meal, t] of Object.entries(mealTimes)) if (t) candidates.push({ time: t, label: MEAL_LABELS[meal as MealType] });
  }
  const upcoming = candidates.filter((c) => /^\d{2}:\d{2}$/.test(c.time) && timeToMinutes(c.time) > nowMin).sort((a, b) => a.time.localeCompare(b.time));
  return upcoming[0] ?? null;
}
