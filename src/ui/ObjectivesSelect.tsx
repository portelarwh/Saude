import React from 'react';
import { View } from 'react-native';
import { combineObjectives } from '../domain/goals';
import type { Objective } from '../domain/types';
import { MultiChipSelect, T } from './components';
import { OBJECTIVES } from './labels';

const LABEL = Object.fromEntries(OBJECTIVES.map((o) => [o.value, o.label])) as Record<Objective, string>;

/** Objetivos com múltipla escolha; mostra qual combinação orienta as metas. */
export function ObjectivesSelect({ value, onChange }: { value: Objective[]; onChange: (list: Objective[]) => void }) {
  const combined = combineObjectives(value);
  return (
    <View style={{ gap: 4 }}>
      <MultiChipSelect label="Objetivos (marque quantos quiser)" options={OBJECTIVES} value={value} onChange={onChange} />
      {value.length > 1 && combined ? <T variant="tiny">{`As metas de calorias e proteína seguem: ${LABEL[combined]}.`}</T> : null}
    </View>
  );
}
