import React from 'react';
import { View } from 'react-native';
import { MultiChipSelect, T } from './components';
import { DIET_STYLES, FOODS_AVOIDED } from './labels';

/**
 * Alimentação em duas perguntas claras: o estilo que você segue/quer seguir
 * e o que você não come. Os dois ficam na mesma lista do perfil.
 */
export function RestrictionsSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const styles = DIET_STYLES.map((o) => o.value);
  const avoided = FOODS_AVOIDED.map((o) => o.value);
  const others = value.filter((v) => !styles.includes(v) && !avoided.includes(v));
  const pick = (group: string[]) => value.filter((v) => group.includes(v));
  const replace = (group: string[], next: string[]) => onChange([...value.filter((v) => !group.includes(v)), ...next]);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <MultiChipSelect label="Estilo que você segue ou quer seguir" options={DIET_STYLES} value={pick(styles)} onChange={(v) => replace(styles, v)} />
        <T variant="tiny">Marque o que você quer: “Menos açúcar” = quero comer menos açúcar.</T>
      </View>
      <View style={{ gap: 4 }}>
        <MultiChipSelect label="Não como / evito" options={FOODS_AVOIDED} value={pick(avoided)} onChange={(v) => replace(avoided, v)} />
        <T variant="tiny">Marque o que fica de fora das sugestões: “Lactose” = não consumo lactose.</T>
      </View>
      {others.length ? <T variant="tiny">{`Outras restrições salvas: ${others.join(', ')}.`}</T> : null}
    </View>
  );
}
