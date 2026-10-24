/**
 * Componentes reutilizáveis da interface. Áreas de toque ≥ 44 px, textos
 * legíveis e operação com uma mão.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { maskBRDate } from '../domain/dates';
import { normalizeHeightCm } from '../domain/goals';
import { font, radius, spacing, useTheme } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, padded = true, footer }: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode }) {
  const { colors } = useTheme();
  const content = <View style={[padded && { padding: spacing.lg, gap: spacing.lg }, { paddingBottom: 96 }]}>{children}</View>;
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>{content}</ScrollView> : content}
      {footer}
    </SafeAreaView>
  );
}

export function T({ children, variant = 'body', color, style, numberOfLines, accessibilityRole }: {
  children: ReactNode;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'tiny' | 'label';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: 'header';
}) {
  const { colors } = useTheme();
  const base: TextStyle = {
    h1: { fontSize: font.h1, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
    h2: { fontSize: font.h2, fontWeight: '700' as const, color: colors.text },
    h3: { fontSize: font.h3, fontWeight: '600' as const, color: colors.text },
    body: { fontSize: font.body, color: colors.text, lineHeight: 21 },
    small: { fontSize: font.small, color: colors.textSecondary, lineHeight: 18 },
    tiny: { fontSize: font.tiny, color: colors.muted },
    label: { fontSize: font.small, fontWeight: '600' as const, color: colors.textSecondary },
  }[variant];
  return (
    <Text
      style={[base, color ? { color } : null, style]}
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole ?? (variant.startsWith('h') ? 'header' : undefined)}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  const s = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

export function Row({ children, gap = spacing.sm, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, small, style, accessibilityLabel }: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'water';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    water: { bg: colors.water, fg: '#FFFFFF', border: colors.water },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} /> : null}
      <Text style={{ color: palette.fg, fontWeight: '600', fontSize: small ? font.small : font.body }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, size = 22 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon} size={size} color={color ?? colors.textSecondary} />
    </Pressable>
  );
}

export function Field({ label, hint, error, style, suffix, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null; suffix?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[{ gap: 6 }, style as StyleProp<ViewStyle>]}>
      <T variant="label">{label}</T>
      <View style={[styles.input, { borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          style={{ flex: 1, color: colors.text, fontSize: font.body, paddingVertical: 10, minHeight: 44 }}
          {...props}
        />
        {suffix ? <T variant="small">{suffix}</T> : null}
      </View>
      {error ? <T variant="small" color={colors.danger}>{error}</T> : hint ? <T variant="tiny">{hint}</T> : null}
    </View>
  );
}

/** Campo numérico que aceita vírgula decimal; `null` = vazio (não informado). */
export function NumberField({ value, onChange, ...rest }: Omit<React.ComponentProps<typeof Field>, 'value' | 'onChangeText' | 'onChange'> & { value: number | null | undefined; onChange: (v: number | null) => void }) {
  const format = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const [text, setText] = React.useState(format(value));
  const [lastValue, setLastValue] = React.useState(value);
  // valor alterado de fora (ex.: botão de medida caseira): sincroniza o texto durante a renderização
  if (value !== lastValue) {
    setLastValue(value);
    if (parseDecimal(text) !== (value ?? null)) setText(format(value));
  }
  return (
    <Field
      {...rest}
      keyboardType="decimal-pad"
      value={text}
      onChangeText={(t) => {
        setText(t);
        onChange(parseDecimal(t));
      }}
    />
  );
}

/** Data DD/MM/AAAA: digite só os números ("14071985") e as barras entram sozinhas. */
export function DateField({ value, onChangeText, ...rest }: Omit<React.ComponentProps<typeof Field>, 'keyboardType' | 'maxLength'> & { value: string; onChangeText: (t: string) => void }) {
  return <Field placeholder="DD/MM/AAAA" {...rest} value={value} keyboardType="number-pad" maxLength={10} onChangeText={(t) => onChangeText(maskBRDate(t))} />;
}

/** Altura em centímetros; se digitar em metros (1,75), converte para 175 ao sair do campo. */
export function HeightField({ value, onChange, ...rest }: Omit<React.ComponentProps<typeof NumberField>, 'suffix'>) {
  return (
    <NumberField
      placeholder="Ex.: 175"
      {...rest}
      suffix="cm"
      value={value}
      onChange={onChange}
      onBlur={() => {
        const cm = normalizeHeightCm(value ?? null);
        if (cm !== (value ?? null)) onChange(cm);
      }}
    />
  );
}

export function parseDecimal(t: string): number | null {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.primaryText : colors.textSecondary} /> : null}
      <Text style={{ color: selected ? colors.primaryText : colors.text, fontSize: font.small, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function ChipSelect<V extends string | number>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V | null; onChange: (v: V) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label">{label}</T> : null}
      <Row wrap>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </Row>
    </View>
  );
}

export function MultiChipSelect<V extends string>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V[]; onChange: (v: V[]) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label">{label}</T> : null}
      <Row wrap>
        {options.map((o) => {
          const on = value.includes(o.value);
          return <Chip key={o.value} label={o.label} selected={on} onPress={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])} />;
        })}
      </Row>
    </View>
  );
}

export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {description ? <T variant="small">{description}</T> : null}
      </View>
      <View style={[styles.switchTrack, { backgroundColor: value ? colors.primary : colors.border }]}>
        <View style={[styles.switchThumb, { backgroundColor: colors.surface, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function ProgressBar({ pct, color, height = 10, label }: { pct: number | null; color?: string; height?: number; label?: string }) {
  const { colors } = useTheme();
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={pct === null ? { text: 'sem registros' } : { min: 0, max: 100, now: Math.round(w) }}
      style={{ height, borderRadius: height, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}
    >
      <View style={{ width: `${w}%`, height, borderRadius: height, backgroundColor: color ?? colors.primary }} />
    </View>
  );
}

export function Notice({ kind = 'info', title, children, action }: { kind?: 'info' | 'warning' | 'error' | 'success'; title?: string; children: ReactNode; action?: ReactNode }) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' as IconName },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-circle' as IconName },
    error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' as IconName },
    success: { bg: colors.primarySoft, fg: colors.primary, icon: 'checkmark-circle' as IconName },
  }[kind];
  return (
    <View style={[styles.notice, { backgroundColor: map.bg }]} accessibilityRole="alert">
      <Ionicons name={map.icon} size={20} color={map.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T variant="label" color={map.fg}>{title}</T> : null}
        {typeof children === 'string' ? <T variant="small" color={colors.text}>{children}</T> : children}
        {action}
      </View>
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' | 'water' | 'warning' | 'danger' | 'info' }) {
  const { colors } = useTheme();
  const map = {
    neutral: [colors.surfaceAlt, colors.textSecondary],
    primary: [colors.primarySoft, colors.primary],
    water: [colors.waterSoft, colors.water],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    info: [colors.infoSoft, colors.info],
  }[tone];
  return (
    <View style={{ backgroundColor: map[0], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: map[1], fontSize: font.tiny, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: spacing.sm }}>
      <T variant="h3">{title}</T>
      {action}
    </Row>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <T variant="h3" style={{ textAlign: 'center' }}>{title}</T>
      {message ? <T variant="small" style={{ textAlign: 'center' }}>{message}</T> : null}
      {action}
    </View>
  );
}

export function ListItem({ title, subtitle, right, onPress, icon, iconColor }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; icon?: IconName; iconColor?: string }) {
  const { colors } = useTheme();
  const inner = (
    <Row gap={spacing.md} style={{ minHeight: 48, paddingVertical: 8 }}>
      {icon ? <Ionicons name={icon} size={20} color={iconColor ?? colors.primary} /> : null}
      <View style={{ flex: 1 }}>
        <T numberOfLines={2}>{title}</T>
        {subtitle ? <T variant="small" numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Row>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {inner}
    </Pressable>
  ) : (
    inner
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
          <T variant="h2">{title}</T>
          <IconButton icon="close" label="Fechar" onPress={onClose} />
        </Row>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
    boxShadow: '0px 4px 14px rgba(11, 42, 28, 0.07)',
  },
  button: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonSmall: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  switchTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 22, height: 22, borderRadius: 11 },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: '90%' },
});
