import React from 'react';
import { View } from 'react-native';
import { ACTIVITY_FACTORS, suggestActivityLevel } from '../domain/energy';
import type { ActivityLevel, Profile } from '../domain/types';
import { Button, Notice, NumberField, Row } from './components';

type TrainingProfile = Pick<Profile, 'activity_level'> & Partial<Pick<Profile, 'strength_sessions_per_week' | 'strength_session_min'>>;

/** Treino de força (vezes por semana e duração) com sugestão de nível de atividade coerente. */
export function TrainingFields({ p, onChange }: { p: TrainingProfile; onChange: (patch: Partial<Profile>) => void }) {
  const sessions = p.strength_sessions_per_week ?? null;
  const suggestion = suggestActivityLevel(p.activity_level, sessions, p.strength_session_min ?? null);
  return (
    <View style={{ gap: 8 }}>
      <Row>
        <NumberField
          integer
          label="Treinos de força por semana"
          value={sessions}
          onChange={(v) => {
            const n = v === null ? null : Math.max(0, Math.min(14, Math.round(v)));
            onChange({ strength_sessions_per_week: n, does_resistance_training: n === null ? null : n > 0 });
          }}
          placeholder="0 se não faz"
          style={{ flex: 1 }}
        />
        <NumberField integer label="Duração (min)" value={p.strength_session_min ?? null} onChange={(v) => onChange({ strength_session_min: v === null ? null : Math.round(v) })} placeholder="Ex.: 60" style={{ flex: 1 }} />
      </Row>
      {suggestion?.incoherent ? (
        <Notice
          kind="warning"
          title="Nível de atividade abaixo do seu treino"
          action={<Button small title={`Usar "${ACTIVITY_FACTORS[suggestion.suggested].label}"`} onPress={() => onChange({ activity_level: suggestion.suggested as ActivityLevel })} />}
        >
          {suggestion.reason}
        </Notice>
      ) : null}
    </View>
  );
}
