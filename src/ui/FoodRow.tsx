import React from 'react';
import type { Food } from '../domain/types';
import { ListItem } from './components';
import { num, SOURCE_LABEL } from './format';

export function FoodRow({ food, onPress }: { food: Food; onPress: () => void }) {
  const kcal = food.per100.energy_kcal;
  return (
    <ListItem
      title={[food.name, food.brand, food.flavor].filter(Boolean).join(' · ')}
      subtitle={`${SOURCE_LABEL[food.source] ?? food.source} · ${kcal === null || kcal === undefined ? 'energia não informada' : `${num(kcal)} kcal`} / 100 ${food.base_unit} · ${num(food.per100.protein_g, 1)} g prot.`}
      onPress={onPress}
    />
  );
}
