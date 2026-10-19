/**
 * Gráficos em SVG (react-native-svg, funciona no Android e na web).
 * - Uma série por gráfico (sem legenda; o título nomeia a série).
 * - Linha de 2 px, marcadores ≥ 8 px, grade discreta.
 * - Toque/arraste (ou passe o mouse na web) mostra data e valor.
 * - "Ver tabela" oferece os mesmos dados em texto (acessibilidade).
 */
import React, { useMemo, useState } from 'react';
import { type GestureResponderEvent, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { formatDateBR } from '../domain/dates';
import { Row, T } from './components';
import { spacing, useTheme } from './theme';

export interface Point {
  date: string; // ISO
  value: number;
}

const pad = { l: 40, r: 12, t: 12, b: 24 };

function fmt(v: number, decimals: number) {
  return v.toFixed(decimals).replace('.', ',');
}

export function LineChart({ points, unit, decimals = 1, height = 180, color, smooth, title }: {
  points: Point[];
  unit: string;
  decimals?: number;
  height?: number;
  color?: string;
  /** Série suavizada (média móvel) desenhada por cima, tracejada. */
  smooth?: Point[];
  title: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const stroke = color ?? colors.chart.primary;

  const geo = useMemo(() => {
    if (!points.length) return null;
    const ts = points.map((p) => new Date(p.date).getTime());
    const vs = [...points.map((p) => p.value), ...(smooth ?? []).map((p) => p.value)];
    let min = Math.min(...vs);
    let max = Math.max(...vs);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    min -= span * 0.1;
    max += span * 0.1;
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const x = (t: number) => (t1 === t0 ? (pad.l + width - pad.r) / 2 : pad.l + ((t - t0) / (t1 - t0)) * (width - pad.l - pad.r));
    const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
    const ticks = [0, 0.5, 1].map((f) => min + f * (max - min));
    return { x, y, ticks, ts };
  }, [points, smooth, width, height]);

  if (!points.length || !geo) {
    return <T variant="small">Sem dados para o gráfico.</T>;
  }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${geo.x(geo.ts[i]).toFixed(1)},${geo.y(p.value).toFixed(1)}`).join(' ');
  const smoothPath = smooth?.length
    ? smooth.map((p, i) => `${i ? 'L' : 'M'}${geo.x(new Date(p.date).getTime()).toFixed(1)},${geo.y(p.value).toFixed(1)}`).join(' ')
    : null;

  const pick = (e: GestureResponderEvent | { nativeEvent: { locationX: number } }) => {
    const lx = e.nativeEvent.locationX;
    let best = 0;
    let bestD = Infinity;
    geo.ts.forEach((t, i) => {
      const d = Math.abs(geo.x(t) - lx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setActive(best);
  };

  const a = active !== null ? points[active] : null;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        // @ts-expect-error eventos de mouse existem no react-native-web
        onMouseMove={(e: { nativeEvent: { offsetX: number } }) => pick({ nativeEvent: { locationX: e.nativeEvent.offsetX } })}
        onMouseLeave={() => setActive(null)}
        accessible
        accessibilityLabel={`${title}: de ${fmt(first.value, decimals)} ${unit} em ${formatDateBR(first.date)} para ${fmt(last.value, decimals)} ${unit} em ${formatDateBR(last.date)}`}
      >
        <Svg width={width} height={height}>
          {geo.ticks.map((v, i) => (
            <G key={i}>
              <Line x1={pad.l} x2={width - pad.r} y1={geo.y(v)} y2={geo.y(v)} stroke={colors.chart.grid} strokeWidth={1} />
              <SvgText x={pad.l - 6} y={geo.y(v) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
                {fmt(v, decimals)}
              </SvgText>
            </G>
          ))}
          <SvgText x={pad.l} y={height - 6} fontSize={10} fill={colors.muted}>
            {formatDateBR(first.date)}
          </SvgText>
          <SvgText x={width - pad.r} y={height - 6} fontSize={10} fill={colors.muted} textAnchor="end">
            {formatDateBR(last.date)}
          </SvgText>
          {smoothPath ? <Path d={smoothPath} stroke={colors.textSecondary} strokeWidth={2} strokeDasharray="4 4" fill="none" /> : null}
          <Path d={path} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <Circle key={i} cx={geo.x(geo.ts[i])} cy={geo.y(p.value)} r={active === i ? 6 : 4} fill={stroke} stroke={colors.surface} strokeWidth={2} />
          ))}
          {a ? <Line x1={geo.x(geo.ts[active!])} x2={geo.x(geo.ts[active!])} y1={pad.t} y2={height - pad.b} stroke={colors.border} strokeWidth={1} /> : null}
        </Svg>
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="small">
          {a ? `${formatDateBR(a.date)}: ${fmt(a.value, decimals)} ${unit}` : `Último: ${fmt(last.value, decimals)} ${unit}`}
        </T>
        <Pressable onPress={() => setShowTable((s) => !s)} accessibilityRole="button" hitSlop={8}>
          <T variant="small" color={colors.primary}>{showTable ? 'Ocultar tabela' : 'Ver tabela'}</T>
        </Pressable>
      </Row>
      {smoothPath ? <T variant="tiny">Linha tracejada: média móvel de 7 dias.</T> : null}
      {showTable ? (
        <View style={{ gap: 2 }}>
          {points
            .slice()
            .reverse()
            .map((p, i) => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <T variant="small">{formatDateBR(p.date)}</T>
                <T variant="small">{`${fmt(p.value, decimals)} ${unit}`}</T>
              </Row>
            ))}
        </View>
      ) : null}
    </View>
  );
}

/** Barras verticais simples (ex.: água por hora, minutos de atividade por dia). */
export function BarChart({ data, unit, height = 140, color, title }: { data: { label: string; value: number }[]; unit: string; height?: number; color?: string; title: string }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = { b: 18, t: 8 };
  const gap = 2;
  const bw = Math.max(4, (width - gap * (data.length - 1)) / Math.max(1, data.length));
  const fill = color ?? colors.chart.water;
  return (
    <View style={{ gap: spacing.xs }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${title}: ${data.filter((d) => d.value > 0).map((d) => `${d.label} ${Math.round(d.value)} ${unit}`).join(', ') || 'sem registros'}`}>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={height - pad.b} y2={height - pad.b} stroke={colors.chart.grid} strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.value / max) * (height - pad.b - pad.t);
          const x = i * (bw + gap);
          return (
            <G key={i} onPress={() => setActive(i)}>
              <Rect x={x} y={pad.t} width={bw} height={height - pad.b - pad.t} fill="transparent" />
              {d.value > 0 ? <Rect x={x} y={height - pad.b - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={fill} opacity={active === null || active === i ? 1 : 0.5} /> : null}
              {data.length <= 12 || i % 3 === 0 ? (
                <SvgText x={x + bw / 2} y={height - 4} fontSize={9} fill={colors.muted} textAnchor="middle">
                  {d.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
      <T variant="small">{active !== null ? `${data[active].label}: ${Math.round(data[active].value)} ${unit}` : 'Toque em uma barra para ver o valor.'}</T>
    </View>
  );
}

/** Anel de progresso para os indicadores prioritários (proteína e água). */
export function Ring({ pct, size = 104, color, children, label }: { pct: number | null; size?: number; color: string; children?: React.ReactNode; label: string }) {
  const { colors } = useTheme();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={label}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${(p / 100) * c} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
