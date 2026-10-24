import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ACTIVITY_LABELS, estimateActivityKcal, INTENSITY_LABELS } from '../domain/activities';
import { formatDateBR, isValidTime, parseBRDate } from '../domain/dates';
import type { ActivityLog, ActivityType, Intensity } from '../domain/types';
import { useStore } from '../state/AppProvider';
import { useProfile } from '../state/hooks';
import { Button, Card, ChipSelect, DateField, Field, Notice, NumberField, Row, Screen, T } from '../ui/components';

export default function NewActivity() {
  const router = useRouter();
  const store = useStore();
  const { profile } = useProfile();
  const [type, setType] = useState<ActivityType>('walking');
  const [custom, setCustom] = useState('');
  const [duration, setDuration] = useState<number | null>(30);
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [rpe, setRpe] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [dateText, setDateText] = useState(formatDateBR(new Date()));
  const [timeText, setTimeText] = useState(new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const estimate = duration ? estimateActivityKcal(type, intensity, duration, profile?.current_weight_kg ?? null) : null;

  const save = async () => {
    const date = parseBRDate(dateText);
    if (!date) return setError('Data inválida.');
    if (!isValidTime(timeText)) return setError('Horário inválido (HH:MM).');
    if (!duration || duration <= 0 || duration > 1440) return setError('Informe a duração em minutos.');
    if (rpe !== null && (rpe < 1 || rpe > 10)) return setError('Esforço percebido deve ser de 1 a 10.');
    await store.insert<ActivityLog>('activities', {
      date,
      started_at: new Date(`${date}T${timeText}:00`).toISOString(),
      type,
      custom_name: custom.trim() || null,
      duration_min: Math.round(duration),
      intensity,
      rpe,
      distance_km: distance,
      notes: notes.trim() || null,
      kcal_estimated: estimate?.kcal ?? null,
      kcal_source: estimate ? 'met' : null,
      source: 'manual',
      external_id: null,
    });
    router.back();
  };

  return (
    <Screen>
      <ChipSelect label="Tipo" options={(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((t) => ({ value: t, label: ACTIVITY_LABELS[t] }))} value={type} onChange={setType} />
      {type === 'other' ? <Field label="Nome da atividade" value={custom} onChangeText={setCustom} /> : null}
      <Card>
        <Row>
          <DateField label="Data" value={dateText} onChangeText={setDateText} style={{ flex: 1 }} />
          <Field label="Início" value={timeText} onChangeText={setTimeText} style={{ width: 110 }} />
        </Row>
        <Row>
          <NumberField label="Duração" suffix="min" value={duration} onChange={setDuration} style={{ flex: 1 }} />
          {['walking', 'running', 'cycling', 'swimming'].includes(type) ? <NumberField label="Distância" suffix="km" value={distance} onChange={setDistance} style={{ flex: 1 }} /> : null}
        </Row>
        <ChipSelect label="Intensidade" options={(Object.keys(INTENSITY_LABELS) as Intensity[]).map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))} value={intensity} onChange={setIntensity} />
        <NumberField label="Esforço percebido (1–10, opcional)" value={rpe} onChange={setRpe} />
        <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
      </Card>
      {estimate ? (
        <Notice kind="info" title={`Estimativa: ~${estimate.kcal} kcal (faixa ${estimate.low}–${estimate.high})`}>
          {`${estimate.explanation} Estimativa de gasto adicional ao repouso; não é somada automaticamente à sua meta alimentar.`}
        </Notice>
      ) : (
        <T variant="small">{profile?.current_weight_kg ? 'Sem referência de MET para este tipo: o gasto não será estimado.' : 'Informe seu peso no perfil para estimar o gasto.'}</T>
      )}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button title="Salvar atividade" icon="checkmark" onPress={save} />
    </Screen>
  );
}
