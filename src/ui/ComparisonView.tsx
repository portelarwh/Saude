import React from 'react';
import { interpret, METRICS, type Comparison } from '../domain/bodyComposition';
import { formatDateBR } from '../domain/dates';
import { Card, Divider, Notice, Row, T } from './components';
import { num, signed } from './format';
import { useTheme } from './theme';

export function ComparisonView({ comparison }: { comparison: Comparison }) {
  const { colors } = useTheme();
  const i = interpret(comparison);
  const toneColor = { improved: colors.primary, worsened: colors.danger, stable: colors.textSecondary, changed: colors.info };
  const word = { improved: 'melhorou', worsened: 'piorou', stable: 'estável', changed: 'variou' };
  return (
    <>
      <Card>
        <T variant="h3">{`Análise numérica · ${comparison.days} dias`}</T>
        <T variant="tiny">{`${formatDateBR(comparison.fromDate)} → ${formatDateBR(comparison.toDate)}`}</T>
        {comparison.changes.map((c) => (
          <Row key={c.key} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <T variant="small" style={{ flex: 1 }}>{c.label}</T>
            <T variant="small" style={{ textAlign: 'right' }}>
              {`${num(c.from, 1)} → ${num(c.to, 1)} ${c.unit}\n${c.pp !== null ? `${signed(c.pp)} p.p.` : `${signed(c.abs, 2)} ${c.unit}${c.pct !== null ? ` (${signed(c.pct)}%)` : ''}`}`}
            </T>
            <T variant="tiny" color={toneColor[c.direction]} style={{ width: 64, textAlign: 'right' }}>{word[c.direction]}</T>
          </Row>
        ))}
        {comparison.unitMismatches.length ? <T variant="tiny">{`Não comparados por unidades diferentes: ${comparison.unitMismatches.map((k) => METRICS[k].label).join(', ')}.`}</T> : null}
        {!comparison.changes.length ? <T variant="small">As avaliações não têm indicadores em comum.</T> : null}
      </Card>
      <Card>
        <T variant="h3">Análise interpretativa</T>
        <T>{i.summary}</T>
        {i.improved.length ? <T variant="small">{`Melhoraram: ${i.improved.join(', ')}.`}</T> : null}
        {i.worsened.length ? <T variant="small">{`Pioraram: ${i.worsened.join(', ')}.`}</T> : null}
        {i.stable.length ? <T variant="small">{`Estáveis (dentro da variação de medição): ${i.stable.join(', ')}.`}</T> : null}
        {i.attention.map((t) => <Notice key={t} kind="warning">{t}</Notice>)}
        <Divider />
        {i.caveats.map((t) => <T key={t} variant="tiny">{`• ${t}`}</T>)}
      </Card>
    </>
  );
}
