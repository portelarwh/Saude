import React, { useState } from 'react';
import { View } from 'react-native';
import { measureName, measureUnit, wholePortions } from '../domain/portions';
import type { HouseholdMeasure } from '../domain/types';
import { ChipSelect, NumberField, T } from './components';
import { num } from './format';

/**
 * Quantidade em medida caseira ("2 unidades", "1,5 copo") ou em g/ml.
 * Guarda sempre g/ml; a medida é só a forma de digitar. Começa na medida
 * caseira quando o alimento tem uma (ex.: ovo → unidades).
 */
export function AmountField({ label = 'Quantidade', unit, value, onChange, measures }: { label?: string; unit: string; value: number | null; onChange: (v: number) => void; measures?: HouseholdMeasure[] | null }) {
  const list = (measures ?? []).filter((m) => m.amount > 0);
  const initial = list.length ? Math.max(0, list.findIndex((m) => value === null || wholePortions(value, m) !== null)) : -1;
  const [mode, setMode] = useState<number>(list.length && (value === null || list.some((m) => wholePortions(value, m) !== null)) ? initial : -1);
  const m = mode >= 0 ? list[mode] : null;
  const portions = m && value ? Math.round((value / m.amount) * 100) / 100 : null;

  return (
    <View style={{ gap: 6 }}>
      {list.length ? (
        <ChipSelect<number>
          label="Medir em"
          options={[...list.map((x, i) => ({ value: i, label: `${measureName(x)} (${num(x.amount)} ${unit}${x.estimated ? ' ~' : ''})` })), { value: -1, label: unit === 'ml' ? 'mililitros' : 'gramas' }]}
          value={mode}
          onChange={setMode}
        />
      ) : null}
      {m ? (
        <>
          <NumberField key={`m${mode}`} label={`${label} (${measureUnit(m, 2)})`} suffix={measureUnit(m, portions ?? 1)} value={portions} onChange={(p) => p && p > 0 && onChange(Math.round(p * m.amount * 10) / 10)} />
          {value ? <T variant="tiny">{`= ${num(value)} ${unit}${m.estimated ? ' (medida caseira estimada; se souber o peso, use gramas)' : ''}`}</T> : null}
        </>
      ) : (
        <NumberField key="base" label={`${label} (${unit})`} suffix={unit} value={value} onChange={(v) => v && v > 0 && onChange(v)} />
      )}
    </View>
  );
}
