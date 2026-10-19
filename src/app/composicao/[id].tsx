/** Avaliação corporal: valores, comparação com a anterior e com a inicial. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking } from 'react-native';
import { compareAssessments, METRIC_ORDER, METRICS } from '../../domain/bodyComposition';
import { formatDateBR } from '../../domain/dates';
import type { BodyAssessment, BodyMetricKey } from '../../domain/types';
import { deletePrivateFile, signedUrl } from '../../services/files';
import { useStore } from '../../state/AppProvider';
import { useCollection } from '../../state/hooks';
import { Badge, Button, Card, Chip, Notice, NumberField, Row, Screen, Sheet, T } from '../../ui/components';
import { ComparisonView } from '../../ui/ComparisonView';
import { confirmAction } from '../../ui/confirm';
import { num } from '../../ui/format';

const SEGMENTS = { right_arm: 'Braço direito', left_arm: 'Braço esquerdo', trunk: 'Tronco', right_leg: 'Perna direita', left_leg: 'Perna esquerda' } as const;
const KINDS = { lean_mass: 'massa magra', fat_mass: 'gordura', muscle_mass: 'músculo' } as const;

export default function AssessmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const all = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: true } });
  const [against, setAgainst] = useState<'previous' | 'initial'>('previous');
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Partial<Record<BodyMetricKey, number | null>>>({});

  const idx = all.data.findIndex((a) => a.id === id);
  const a = all.data[idx];
  if (!a) return <Screen><T>{all.loading ? 'Carregando…' : 'Avaliação não encontrada.'}</T></Screen>;
  const previous = idx > 0 ? all.data[idx - 1] : null;
  const initial = idx > 0 ? all.data[0] : null;
  const base = against === 'previous' ? previous : initial;
  const comparison = base ? compareAssessments(base, a) : null;

  const openFile = async () => {
    if (!a.file_path) return;
    const url = await signedUrl(a.file_path);
    if (url) Linking.openURL(url);
  };

  const remove = () =>
    confirmAction('Excluir avaliação', 'A avaliação e o arquivo original serão excluídos.', async () => {
      if (a.file_path) await deletePrivateFile(a.file_path).catch(() => undefined);
      await store.remove('body_assessments', a.id);
      router.back();
    });

  const saveEdits = async () => {
    const metrics = { ...a.metrics };
    for (const [k, v] of Object.entries(edits) as [BodyMetricKey, number | null][]) {
      if (v === null) delete metrics[k];
      else metrics[k] = { value: v, unit: metrics[k]?.unit ?? METRICS[k].unit };
    }
    await store.update<BodyAssessment>('body_assessments', a.id, { metrics });
    setEditing(false);
    setEdits({});
  };

  return (
    <Screen>
      <T variant="h2">{formatDateBR(a.measured_at)}</T>
      <Row wrap>
        {a.device_manufacturer || a.device_model ? <Badge label={[a.device_manufacturer, a.device_model].filter(Boolean).join(' ')} tone="info" /> : null}
        <Badge label={a.input === 'import' ? 'importado e conferido' : 'entrada manual'} />
        {a.conditions?.fasting ? <Badge label="em jejum" /> : null}
        {a.conditions?.exercised_before ? <Badge label="após exercício" tone="warning" /> : null}
      </Row>

      <Card>
        <T variant="h3">Valores medidos</T>
        {METRIC_ORDER.filter((k) => a.metrics[k]).map((k) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}>
            <T variant="small">{METRICS[k].label}</T>
            <T variant="small">{`${num(a.metrics[k]!.value, 2)} ${a.metrics[k]!.unit}`}</T>
          </Row>
        ))}
        {a.visceral_fat_scale ? <T variant="tiny">{`Escala de gordura visceral do fabricante: ${a.visceral_fat_scale}`}</T> : null}
        {a.segmental.length ? <T variant="label">Análise segmentar</T> : null}
        {a.segmental.map((sg, k) => (
          <Row key={`sg${k}`} style={{ justifyContent: 'space-between' }}>
            <T variant="small">{`${SEGMENTS[sg.segment]} · ${KINDS[sg.kind]}`}</T>
            <T variant="small">{`${num(sg.value, 2)} ${sg.unit}`}</T>
          </Row>
        ))}
        {a.other_metrics.map((o) => (
          <Row key={o.label} style={{ justifyContent: 'space-between' }}>
            <T variant="small">{o.label}</T>
            <T variant="small">{`${num(o.value, 2)} ${o.unit}`}</T>
          </Row>
        ))}
        <Row wrap>
          <Button small variant="secondary" icon="create-outline" title="Corrigir valores" onPress={() => setEditing(true)} />
          {a.file_path ? <Button small variant="secondary" icon="document-outline" title="Arquivo original" onPress={openFile} /> : null}
          <Button small variant="danger" icon="trash-outline" title="Excluir" onPress={remove} />
        </Row>
      </Card>

      {comparison ? (
        <>
          <Row>
            <Chip label="vs. anterior" selected={against === 'previous'} onPress={() => setAgainst('previous')} />
            <Chip label="vs. inicial" selected={against === 'initial'} onPress={() => setAgainst('initial')} />
          </Row>
          <ComparisonView comparison={comparison} />
        </>
      ) : (
        <Notice kind="info">Esta é sua primeira avaliação. As comparações aparecerão a partir da próxima.</Notice>
      )}

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Corrigir valores">
        <T variant="small">Deixe em branco para remover um indicador que não consta no exame.</T>
        {METRIC_ORDER.filter((k) => a.metrics[k]).map((k) => (
          <NumberField
            key={k}
            label={METRICS[k].label}
            suffix={a.metrics[k]!.unit}
            value={k in edits ? edits[k]! : a.metrics[k]!.value}
            onChange={(v) => setEdits((e) => ({ ...e, [k]: v }))}
          />
        ))}
        <Button title="Salvar correções" onPress={saveEdits} />
      </Sheet>
    </Screen>
  );
}
