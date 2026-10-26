import React from 'react';
import { View } from 'react-native';
import { amountToPortions, portionsToAmount } from '../domain/savedMeals';
import type { HouseholdMeasure } from '../domain/types';
import { NumberField, Row } from './components';

/**
 * Quantidade em g/ml com atalho em porções da medida caseira
 * ("1,5" copo de 200 ml = 300 ml). Os dois campos ficam sincronizados.
 */
export function AmountField({ label, unit, value, onChange, measure }: { label: string; unit: string; value: number | null; onChange: (v: number) => void; measure?: HouseholdMeasure | null }) {
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <NumberField label={label} suffix={unit} value={value} onChange={(v) => v && v > 0 && onChange(v)} />
      </View>
      {measure ? (
        <View style={{ flex: 1 }}>
          <NumberField
            label={`Em porções (${measure.label} = ${measure.amount} ${unit})`}
            suffix="×"
            value={value ? amountToPortions(value, measure) : null}
            onChange={(p) => p && p > 0 && onChange(portionsToAmount(p, measure))}
          />
        </View>
      ) : null}
    </Row>
  );
}
