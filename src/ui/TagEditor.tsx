import React, { useState } from 'react';
import { View } from 'react-native';
import { normalizeTags } from '../domain/foodTags';
import { Chip, Field, Row, T } from './components';

/** Tags do alimento ("sanduíche", "lanche"...): toque para remover; sugestões para adicionar. */
export function TagEditor({ value, onChange, suggestions, inferred }: { value: string[]; onChange: (tags: string[]) => void; suggestions: string[]; inferred: string[] }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(/[,;#]/).map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange(normalizeTags([...value, ...parts]));
    setText('');
  };
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">Tags (grupos para a busca)</T>
      {value.length ? (
        <Row wrap>
          {value.map((t) => <Chip key={t} label={`${t} ✕`} selected onPress={() => onChange(value.filter((x) => x !== t))} />)}
        </Row>
      ) : null}
      <Field
        label="Adicionar tag"
        value={text}
        onChangeText={(t) => (/[,;]$/.test(t) ? add(t) : setText(t))}
        onSubmitEditing={() => add(text)}
        returnKeyType="done"
        placeholder="Ex.: sanduíche, lanche, pré-treino"
        hint="Separe com vírgula. Buscar por uma tag mostra todos os alimentos do grupo."
      />
      {suggestions.length ? (
        <Row wrap>
          {suggestions.map((t) => <Chip key={t} label={`+ ${t}`} onPress={() => add(t)} />)}
        </Row>
      ) : null}
      {inferred.length ? <T variant="tiny">{`A busca também já encontra este alimento por: ${inferred.join(', ')}.`}</T> : null}
    </View>
  );
}
