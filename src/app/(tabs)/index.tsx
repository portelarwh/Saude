/**
 * Início — painel do dia no estilo de apps de acompanhamento nutricional:
 * semana, anel de calorias, macros, água, refeições, dicas e resumo.
 * "Sem registros" é mostrado como tal (nunca como zero).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { trend } from '../../domain/bodyComposition';
import { addDays, formatDateBR, parseISODate } from '../../domain/dates';
import { loggingStreak, mealTargets, summarizeDay } from '../../domain/daySummary';
import { hydrationNudge } from '../../domain/hydration';
import { MEAL_LABELS, type ActivityLog, type BodyAssessment, type DiaryEntry, type MealType, type WaterLog, type WeightEntry } from '../../domain/types';
import { useStore } from '../../state/AppProvider';
import { useCollection, useCountedBeverages, useGoals, useProfile, useToday } from '../../state/hooks';
import { IconButton, Notice, Row, Screen, T, type IconName } from '../../ui/components';
import { VersionBadge } from '../../ui/VersionBadge';
import { CalorieHero, InsightCard, MacroCard, MealCard, SectionTitle, StatCard, WaterGlasses, WeekStrip } from '../../ui/dashboard';
import { ml, num, signed } from '../../ui/format';
import { radius, spacing, useTheme } from '../../ui/theme';

const MEALS: { meal: MealType; icon: IconName }[] = [
  { meal: 'breakfast', icon: 'cafe-outline' },
  { meal: 'morning_snack', icon: 'nutrition-outline' },
  { meal: 'lunch', icon: 'restaurant-outline' },
  { meal: 'afternoon_snack', icon: 'ice-cream-outline' },
  { meal: 'dinner', icon: 'moon-outline' },
  { meal: 'supper', icon: 'bed-outline' },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const [date, setDate] = useState(today);
  const since = addDays(date < today ? date : today, -13);
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', since] });
  const water = useCollection<WaterLog>('water_logs', { gte: ['date', since] });
  const activities = useCollection<ActivityLog>('activities', { gte: ['date', since] });
  const weights = useCollection<WeightEntry>('weight_entries', { order: { field: 'measured_at', ascending: true } });
  const assessments = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: true } });
  const counted = useCountedBeverages(profile);
  const goals = goalSet?.targets ?? null;
  const isToday = date === today;

  const day = useMemo(
    () => summarizeDay({ date, entries: entries.data, waterLogs: water.data, activities: activities.data, goals, countedBeverages: counted }),
    [date, entries.data, water.data, activities.data, goals, counted],
  );
  const targets = mealTargets(goals?.energy_kcal.value ?? null);
  const nudge = isToday ? hydrationNudge(day.hydration, new Date(), profile?.wake_time ?? undefined, profile?.sleep_time ?? undefined) : null;
  const streak = loggingStreak(entries.data.map((e) => e.date), today);
  const marked = useMemo(() => new Set(entries.data.map((e) => e.date)), [entries.data]);

  const firstWeight = weights.data[0]?.weight_kg ?? null;
  const lastWeight = weights.data[weights.data.length - 1]?.weight_kg ?? profile?.current_weight_kg ?? null;
  const fat = trend(assessments.data, 'fat_mass_kg', 90);

  const addWater = async (v: number) => {
    const at = isToday ? new Date() : new Date(`${date}T12:00:00`);
    await store.insert<WaterLog>('water_logs', { date, logged_at: at.toISOString(), volume_ml: v, beverage: 'water', container_id: null });
  };

  const d = parseISODate(date);
  const dateLabel = isToday ? `Hoje, ${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}` : formatDateBR(date);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="small">{dateLabel}</T>
            <T variant="h1">{profile?.name ? `${greeting()}, ${profile.name.split(' ')[0]}` : greeting()}</T>
          </View>
          <Row style={{ alignItems: 'center', gap: spacing.sm }}>
            <VersionBadge />
            <IconButton icon="person-circle-outline" size={34} label="Perfil e configurações" onPress={() => router.push('/perfil')} />
          </Row>
        </Row>

        <WeekStrip selected={date} today={today} onSelect={setDate} marked={marked} />

        {!goals ? (
          <Notice kind="warning" title="Metas não definidas">
            Complete seu perfil para calcular metas orientativas.
          </Notice>
        ) : null}

        <CalorieHero energy={day.energy} exerciseKcal={day.activities.kcal} onPress={() => router.push('/(tabs)/alimentacao')} />

        <Row gap={spacing.sm} style={{ alignItems: 'stretch' }}>
          <MacroCard label="Proteína" progress={day.protein} color={colors.macro.protein} highlight />
          <MacroCard label="Carboidratos" progress={day.carbs} color={colors.macro.carbs} />
          <MacroCard label="Gorduras" progress={day.fat} color={colors.macro.fat} />
        </Row>
        {!day.hasFoodRecords ? (
          <T variant="small" style={{ textAlign: 'center' }}>{isToday ? 'Nenhuma refeição registrada hoje. Toque no + para começar.' : 'Sem registros neste dia (não significa consumo zero).'}</T>
        ) : day.partial.length ? (
          <T variant="tiny" style={{ textAlign: 'center' }}>Alguns alimentos não têm todos os nutrientes na fonte: totais parciais.</T>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, boxShadow: '0px 4px 14px rgba(11, 42, 28, 0.07)' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={6}>
              <Ionicons name="water" size={20} color={colors.water} />
              <T variant="h3">Água</T>
            </Row>
            <Pressable onPress={() => router.push('/agua')} accessibilityRole="button" hitSlop={8}>
              <T variant="small" color={colors.water}>Detalhes</T>
            </Pressable>
          </Row>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>
              {day.water.consumed === null ? 'Sem registros' : ml(day.water.consumed)}
              <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '400' }}>{day.water.target ? ` / ${ml(day.water.target)}` : ''}</Text>
            </Text>
            <T variant="small">{day.water.consumed !== null && day.water.remaining !== null ? `Faltam ${ml(day.water.remaining)}` : ''}</T>
          </Row>
          <WaterGlasses consumedMl={day.water.consumed} goalMl={day.water.target} onAdd={addWater} />
          <Row wrap>
            {[200, 250, 500].map((v) => (
              <Pressable
                key={v}
                onPress={() => addWater(v)}
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${v} mililitros de água`}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.waterSoft }}
              >
                <Text style={{ color: colors.water, fontWeight: '700' }}>{`+${v} ml`}</Text>
              </Pressable>
            ))}
          </Row>
        </View>

        {nudge?.message ? <InsightCard icon="water-outline" tone="water" title="Hidratação" text={nudge.message} /> : null}
        {isToday && goals?.protein_g.value && day.protein.consumed !== null && (day.protein.remaining ?? 0) > 0 ? (
          <InsightCard icon="barbell-outline" title="Proteína" text={`Faltam aproximadamente ${Math.round(day.protein.remaining!)} g de proteína para sua meta de hoje. Uma fonte proteica na próxima refeição ajuda a chegar lá.`} />
        ) : null}

        <SectionTitle title="Refeições" action={<Pressable onPress={() => router.push('/refeicoes')} hitSlop={8}><T variant="small" color={colors.primary}>Salvas</T></Pressable>} />
        {MEALS.map(({ meal, icon }) => {
          const list = entries.data.filter((e) => e.date === date && e.meal === meal);
          const t = day.byMeal[meal];
          return (
            <MealCard
              key={meal}
              title={MEAL_LABELS[meal]}
              icon={icon}
              kcal={t?.values.energy_kcal ?? null}
              protein={t?.values.protein_g ?? null}
              items={list.map((e) => e.food_name.split(',')[0])}
              suggestion={targets[meal] ? `Sugestão: ~${num(targets[meal])} kcal` : null}
              onAdd={() => router.push({ pathname: '/adicionar', params: { date, meal } })}
              onPress={() => router.push('/(tabs)/alimentacao')}
            />
          );
        })}

        <SectionTitle title="Resumo" action={<Pressable onPress={() => router.push('/(tabs)/progresso')} hitSlop={8}><T variant="small" color={colors.primary}>Relatórios</T></Pressable>} />
        <Row gap={spacing.sm} style={{ alignItems: 'stretch' }}>
          <StatCard icon="scale-outline" label="Peso" value={lastWeight ? `${num(lastWeight, 1)} kg` : '—'} sub={firstWeight && lastWeight ? `${signed(lastWeight - firstWeight, 1)} kg desde o início` : 'Registre seu peso'} onPress={() => router.push('/peso')} />
          <StatCard icon="flame-outline" label="Sequência" value={`${streak} ${streak === 1 ? 'dia' : 'dias'}`} sub="com registro alimentar" color={colors.macro.carbs} />
        </Row>
        <Row gap={spacing.sm} style={{ alignItems: 'stretch' }}>
          <StatCard
            icon="walk-outline"
            label="Atividade"
            value={day.activities.count ? `${day.activities.minutes} min` : '—'}
            sub={day.activities.count ? `${day.activities.count} registro(s) · ~${num(day.activities.kcal)} kcal` : 'Nenhuma registrada'}
            onPress={() => router.push('/(tabs)/atividades')}
          />
          <StatCard
            icon="body-outline"
            label="Gordura corporal"
            value={fat.direction === 'insufficient' ? '—' : `${signed(fat.change, 1)} kg`}
            sub={fat.direction === 'insufficient' ? 'Adicione avaliações' : `90 dias${fat.consistent ? ' · consistente' : ''}`}
            color={colors.macro.fat}
            onPress={() => router.push('/(tabs)/evolucao')}
          />
        </Row>
      </Screen>
    </SafeAreaView>
  );
}
