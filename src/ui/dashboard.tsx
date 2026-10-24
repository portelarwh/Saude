/**
 * Blocos visuais do painel (estilo app de acompanhamento nutricional):
 * faixa da semana, anel de calorias, cartões de macros, copos de água,
 * cartões de refeição e cartões de dica.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { addDays, parseISODate } from '../domain/dates';
import type { Progress } from '../domain/goals';
import { T, type IconName } from './components';
import { num } from './format';
import { radius, spacing, useTheme } from './theme';

const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Faixa de 7 dias (segunda a domingo da semana do dia selecionado). */
export function WeekStrip({ selected, today, onSelect, marked }: { selected: string; today: string; onSelect: (d: string) => void; marked?: Set<string> }) {
  const { colors } = useTheme();
  const sel = parseISODate(selected);
  const monday = addDays(selected, -((sel.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <View style={styles.week}>
      {days.map((d) => {
        const on = d === selected;
        const date = parseISODate(d);
        const future = d > today;
        return (
          <Pressable
            key={d}
            onPress={() => !future && onSelect(d)}
            disabled={future}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: future }}
            accessibilityLabel={`Dia ${date.getDate()}`}
            style={[styles.day, on && { backgroundColor: colors.primary }]}
          >
            <Text style={{ fontSize: 11, color: on ? colors.primaryText : colors.muted }}>{WEEK[date.getDay()]}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: on ? colors.primaryText : future ? colors.muted : colors.text }}>{date.getDate()}</Text>
            <View style={[styles.dot, { backgroundColor: marked?.has(d) ? (on ? colors.primaryText : colors.primary) : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Cartão de destaque: anel com calorias restantes e consumido/meta/exercício. */
export function CalorieHero({ energy, exerciseKcal, onPress }: { energy: Progress; exerciseKcal: number; onPress?: () => void }) {
  const { colors } = useTheme();
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = energy.pct === null ? 0 : Math.min(100, energy.pct);
  const over = energy.exceeded;
  const center =
    energy.consumed === null
      ? { big: energy.target ? num(energy.target) : '—', small: energy.target ? 'kcal para hoje' : 'defina sua meta' }
      : over
        ? { big: num((energy.consumed ?? 0) - (energy.target ?? 0)), small: 'kcal acima da meta' }
        : { big: energy.target ? num(energy.remaining) : num(energy.consumed), small: energy.target ? 'kcal restantes' : 'kcal consumidas' };
  const ringColor = over ? '#F0B565' : '#8FE0B5';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Calorias: ${center.big} ${center.small}`} style={[styles.hero, { backgroundColor: colors.hero }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} fill="none" />
            {pct > 0 ? (
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={ringColor}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * c} ${c}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ) : null}
          </Svg>
          <Text style={{ color: colors.heroText, fontSize: 32, fontWeight: '800' }}>{center.big}</Text>
          <Text style={{ color: colors.heroText, opacity: 0.8, fontSize: 12, textAlign: 'center', maxWidth: 110 }}>{center.small}</Text>
        </View>
        <View style={{ flex: 1, gap: spacing.md }}>
          <HeroStat icon="restaurant" label="Consumido" value={energy.consumed === null ? 'sem registros' : `${num(energy.consumed)} kcal`} />
          <HeroStat icon="flag" label="Meta" value={energy.target ? `${num(energy.target)} kcal` : '—'} />
          <HeroStat icon="flame" label="Exercício" value={exerciseKcal ? `${num(exerciseKcal)} kcal` : '—'} />
        </View>
      </View>
    </Pressable>
  );
}

function HeroStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={styles.heroIcon}>
        <Ionicons name={icon} size={14} color={colors.heroText} />
      </View>
      <View>
        <Text style={{ color: colors.heroText, opacity: 0.75, fontSize: 11 }}>{label}</Text>
        <Text style={{ color: colors.heroText, fontSize: 15, fontWeight: '700' }}>{value}</Text>
      </View>
    </View>
  );
}

/** Cartão de macro com barra de progresso e restante. */
export function MacroCard({ label, progress, color, highlight }: { label: string; progress: Progress; color: string; highlight?: boolean }) {
  const { colors } = useTheme();
  const pct = progress.pct === null ? 0 : Math.min(100, progress.pct);
  return (
    <View
      style={[styles.macro, { backgroundColor: colors.surface, borderColor: highlight ? color : 'transparent' }]}
      accessible
      accessibilityLabel={`${label}: ${progress.consumed === null ? 'sem registros' : `${Math.round(progress.consumed)} de ${progress.target ?? '?'} gramas`}`}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
        {progress.consumed === null ? '—' : num(progress.consumed)}
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '400' }}>{progress.target ? ` / ${num(progress.target)} g` : ' g'}</Text>
      </Text>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {progress.consumed === null ? 'sem registros' : progress.exceeded ? 'meta atingida' : progress.remaining !== null ? `faltam ${num(progress.remaining)} g` : ''}
      </Text>
    </View>
  );
}

/** Copos de água: cada copo = `glassMl`. Tocar em um copo vazio registra um copo. */
export function WaterGlasses({ consumedMl, goalMl, glassMl = 250, onAdd }: { consumedMl: number | null; goalMl: number | null; glassMl?: number; onAdd: (ml: number) => void }) {
  const { colors } = useTheme();
  const total = Math.max(6, Math.min(16, Math.ceil((goalMl ?? 2000) / glassMl)));
  const full = Math.floor((consumedMl ?? 0) / glassMl);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < full;
        const next = i === full;
        return (
          <Pressable
            key={i}
            onPress={() => next && onAdd(glassMl)}
            disabled={!next}
            accessibilityRole="button"
            accessibilityLabel={next ? `Adicionar um copo de ${glassMl} mililitros` : filled ? 'Copo registrado' : 'Copo'}
            style={[styles.glass, { backgroundColor: filled ? colors.waterSoft : colors.surfaceAlt, borderColor: next ? colors.water : 'transparent' }]}
          >
            <Ionicons name={filled ? 'water' : next ? 'add' : 'water-outline'} size={18} color={filled || next ? colors.water : colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Cartão de refeição do dia. */
export function MealCard({ title, icon, kcal, protein, items, suggestion, onAdd, onPress }: {
  title: string;
  icon: IconName;
  kcal: number | null;
  protein: number | null;
  items: string[];
  suggestion?: string | null;
  onAdd: () => void;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={[styles.meal, { backgroundColor: colors.surface }]}>
      <View style={[styles.mealIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
        {items.length ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{`${num(kcal)} kcal · ${num(protein, 1)} g proteína`}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{items.join(', ')}</Text>
          </>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 13 }}>{suggestion ?? 'Nada registrado'}</Text>
        )}
      </View>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Adicionar em ${title}`} hitSlop={8} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={22} color={colors.primaryText} />
      </Pressable>
    </Pressable>
  );
}

export function InsightCard({ icon, title, text, tone = 'primary', action }: { icon: IconName; title: string; text: string; tone?: 'primary' | 'water' | 'warning'; action?: React.ReactNode }) {
  const { colors } = useTheme();
  const [bg, fg] = { primary: [colors.primarySoft, colors.primary], water: [colors.waterSoft, colors.water], warning: [colors.warningSoft, colors.warning] }[tone];
  return (
    <View style={[styles.insight, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={22} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: fg, fontWeight: '700', fontSize: 14 }}>{title}</Text>
        <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>{text}</Text>
        {action}
      </View>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
      <T variant="h3">{title}</T>
      {action}
    </View>
  );
}

/** Pequeno cartão de estatística para grades 2×2. */
export function StatCard({ icon, label, value, sub, color, onPress }: { icon: IconName; label: string; value: string; sub?: string; color?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}`} style={[styles.stat, { backgroundColor: colors.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={16} color={color ?? colors.primary} />
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 11 }}>{sub}</Text> : null}
    </Pressable>
  );
}

const shadow = { boxShadow: '0px 4px 14px rgba(11, 42, 28, 0.07)' };

const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 44, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  hero: { borderRadius: radius.lg, padding: spacing.lg, ...shadow },
  heroIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  macro: { flex: 1, borderRadius: radius.md, padding: spacing.md, gap: 4, borderWidth: 1.5, ...shadow },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  glass: { width: 36, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  meal: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, ...shadow },
  mealIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  insight: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: 'flex-start' },
  stat: { flex: 1, borderRadius: radius.lg, padding: spacing.md, gap: 4, ...shadow },
});
