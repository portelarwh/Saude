/**
 * Nova avaliação corporal — entrada manual ou importação de exame (PDF/foto).
 * A extração da IA vira um rascunho exibido integralmente para conferência;
 * só é salvo quando o usuário confirma.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { METRIC_ORDER, METRICS, validateAssessmentDraft } from '../../domain/bodyComposition';
import { formatDateBR, parseBRDate } from '../../domain/dates';
import type { BodyAssessment, BodyMetricKey, MeasurementConditions, MetricValue } from '../../domain/types';
import { aiExtractBioimpedance } from '../../services/ai';
import { pickDocument, uploadPrivateFile } from '../../services/files';
import { buildExternalPrompt, parseExternalBioimpedance } from '../../services/externalAi';
import { bioExtractionToDraft, confirmAssessment, type AssessmentDraft } from '../../services/imports';
import type { BioimpedanceExtraction } from '../../../supabase/functions/_shared/schemas';
import { ExternalAiPanel } from '../../ui/ExternalAi';
import { useApp, useStore } from '../../state/AppProvider';
import { useProfile } from '../../state/hooks';
import { Badge, Button, Card, Chip, ChipSelect, Field, Notice, NumberField, Row, Screen, T, Toggle } from '../../ui/components';
import { num } from '../../ui/format';

const SEGMENT_LABELS = { right_arm: 'Braço direito', left_arm: 'Braço esquerdo', trunk: 'Tronco', right_leg: 'Perna direita', left_leg: 'Perna esquerda' } as const;
const KIND_LABELS = { lean_mass: 'massa magra', fat_mass: 'gordura', muscle_mass: 'músculo' } as const;

function emptyDraft(): AssessmentDraft {
  return {
    measured_at: '',
    device_manufacturer: null,
    device_model: null,
    method: 'bioimpedance',
    input: 'manual',
    metrics: {},
    visceral_fat_scale: null,
    segmental: [],
    other_metrics: [],
    conditions: { fasting: null, time_of_day: null, exercised_before: null, hydration_note: null },
    file_path: null,
    extraction_raw: null,
    notes: null,
  };
}

export default function NewAssessment() {
  const router = useRouter();
  const store = useStore();
  const { mode } = useApp();
  const { profile } = useProfile();
  const [draft, setDraft] = useState<AssessmentDraft>(emptyDraft);
  const [dateText, setDateText] = useState(formatDateBR(new Date()));
  const [timeText, setTimeText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [extraKeys, setExtraKeys] = useState<BodyMetricKey[]>([]);
  const aiReady = mode === 'cloud' && Boolean(profile?.consent_ai_at);

  const applyExtraction = (ex: BioimpedanceExtraction, path: string | null, extraWarning?: string) => {
    const r = bioExtractionToDraft(ex, path);
    setDraft({ ...r.draft, conditions: emptyDraft().conditions });
    setWarnings(extraWarning ? [extraWarning, ...r.warnings] : r.warnings);
    if (r.draft.measured_at) {
      const d = new Date(r.draft.measured_at);
      setDateText(formatDateBR(d));
      setTimeText(d.getHours() || d.getMinutes() ? d.toTimeString().slice(0, 5) : '');
    } else setDateText('');
    setImported(true);
  };

  const importFile = async () => {
    setError(null);
    try {
      const file = await pickDocument();
      if (!file) return;
      setBusy(true);
      const path = await uploadPrivateFile(store.userId, 'exames', file);
      applyExtraction(await aiExtractBioimpedance(path), path);
    } catch (e) {
      setError(`${(e as Error).message} Você pode digitar os valores manualmente abaixo.`);
    } finally {
      setBusy(false);
    }
  };

  const setMetric = (key: BodyMetricKey, value: number | null) =>
    setDraft((d) => {
      const metrics = { ...d.metrics };
      if (value === null) delete metrics[key];
      else metrics[key] = { value, unit: d.metrics[key]?.unit ?? METRICS[key].unit } as MetricValue;
      return { ...d, metrics };
    });
  const setCond = (patch: Partial<MeasurementConditions>) => setDraft((d) => ({ ...d, conditions: { ...(d.conditions ?? emptyDraft().conditions!), ...patch } }));

  const iso = (() => {
    const d = parseBRDate(dateText);
    if (!d) return '';
    const t = /^\d{2}:\d{2}$/.test(timeText) ? timeText : '12:00';
    return new Date(`${d}T${t}:00`).toISOString();
  })();
  const finalDraft: AssessmentDraft = { ...draft, measured_at: iso };
  const validation = validateAssessmentDraft(finalDraft);

  const save = async () => {
    setError(null);
    if (validation.errors.length) return setError(validation.errors.join(' '));
    setBusy(true);
    try {
      const saved = await confirmAssessment(store, finalDraft);
      router.replace({ pathname: '/composicao/[id]', params: { id: (saved as BodyAssessment).id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shown = imported ? METRIC_ORDER.filter((k) => draft.metrics[k] || extraKeys.includes(k)) : METRIC_ORDER;
  const hidden = METRIC_ORDER.filter((k) => !shown.includes(k));

  return (
    <Screen>
      <Card>
        <T variant="h3">Importar exame</T>
        <T variant="small">Envie o PDF ou a foto do laudo de bioimpedância. A IA transcreve apenas os indicadores presentes; você confere tudo antes de salvar.</T>
        {aiReady ? (
          <Button icon="document-attach-outline" title="Escolher arquivo (PDF, JPG, PNG)" onPress={importFile} loading={busy} />
        ) : (
          <Notice kind="info">{mode === 'local' ? 'A importação por IA exige a conta na nuvem (Supabase). Digite os valores abaixo.' : 'Autorize o uso de IA em Perfil › Privacidade para importar exames.'}</Notice>
        )}
        {!aiReady ? (
          <ExternalAiPanel
            title="Ler o exame com outra IA"
            description="Abra o Claude, ChatGPT ou Gemini, anexe o PDF ou a foto do laudo e envie a pergunta copiada. Cole a resposta aqui: os valores abrem para conferência e só são salvos quando você confirmar."
            attachHint="Anexe o PDF ou a foto do exame antes de enviar."
            getPrompt={() => buildExternalPrompt('bioimpedance', {})}
            onAnswer={(t) => applyExtraction(parseExternalBioimpedance(t), null, 'Valores transcritos por IA externa: compare cada número com o laudo.')}
          />
        ) : null}
        {imported ? <Notice kind="warning" title="Confira os valores extraídos">Compare com o laudo e corrija o que for preciso. Indicadores ausentes no exame não foram preenchidos.</Notice> : null}
      </Card>
      {warnings.map((w) => <Notice key={w} kind="warning">{w}</Notice>)}

      <Card>
        <T variant="h3">Dados da avaliação</T>
        <Row>
          <Field label="Data original do exame" value={dateText} onChangeText={setDateText} placeholder="DD/MM/AAAA" style={{ flex: 1 }} />
          <Field label="Horário" value={timeText} onChangeText={setTimeText} placeholder="HH:MM" style={{ width: 110 }} />
        </Row>
        <Row>
          <Field label="Fabricante" value={draft.device_manufacturer ?? ''} onChangeText={(t) => setDraft((d) => ({ ...d, device_manufacturer: t || null }))} placeholder="InBody, Tanita…" style={{ flex: 1 }} />
          <Field label="Modelo" value={draft.device_model ?? ''} onChangeText={(t) => setDraft((d) => ({ ...d, device_model: t || null }))} style={{ flex: 1 }} />
        </Row>
        <ChipSelect
          label="Método"
          options={[{ value: 'bioimpedance', label: 'Bioimpedância' }, { value: 'dexa', label: 'DEXA' }, { value: 'skinfold', label: 'Dobras cutâneas' }, { value: 'other', label: 'Outro' }]}
          value={draft.method}
          onChange={(m) => setDraft((d) => ({ ...d, method: m }))}
        />
      </Card>

      <Card>
        <T variant="h3">Indicadores</T>
        <T variant="tiny">Deixe em branco o que não consta no exame.</T>
        {shown.map((k) => (
          <NumberField
            key={k}
            label={`${METRICS[k].label}${draft.metrics[k] && draft.metrics[k]!.unit !== METRICS[k].unit ? ` (unidade do exame: ${draft.metrics[k]!.unit})` : ''}`}
            suffix={draft.metrics[k]?.unit ?? METRICS[k].unit}
            value={draft.metrics[k]?.value ?? null}
            onChange={(v) => setMetric(k, v)}
          />
        ))}
        {hidden.length ? (
          <>
            <T variant="label">Adicionar indicador que a leitura não encontrou</T>
            <Row wrap>{hidden.map((k) => <Chip key={k} label={METRICS[k].label} onPress={() => setExtraKeys((x) => [...x, k])} />)}</Row>
          </>
        ) : null}
        {draft.metrics.visceral_fat_level ? (
          <Field label="Escala de gordura visceral do fabricante" value={draft.visceral_fat_scale ?? ''} onChangeText={(t) => setDraft((d) => ({ ...d, visceral_fat_scale: t || null }))} placeholder="Ex.: nível 1–20" />
        ) : null}
      </Card>

      {draft.segmental.length || draft.other_metrics.length ? (
        <Card>
          <T variant="h3">Outros dados do exame</T>
          {draft.segmental.map((s, i) => (
            <Row key={`s${i}`} style={{ justifyContent: 'space-between' }}>
              <T variant="small">{`${SEGMENT_LABELS[s.segment]} · ${KIND_LABELS[s.kind]}`}</T>
              <Row>
                <T variant="small">{`${num(s.value, 2)} ${s.unit}`}</T>
                <Button small variant="ghost" title="Remover" onPress={() => setDraft((d) => ({ ...d, segmental: d.segmental.filter((_, j) => j !== i) }))} />
              </Row>
            </Row>
          ))}
          {draft.other_metrics.map((o, i) => (
            <Row key={`o${i}`} style={{ justifyContent: 'space-between' }}>
              <T variant="small">{o.label}</T>
              <Row>
                <T variant="small">{`${num(o.value, 2)} ${o.unit}`}</T>
                <Button small variant="ghost" title="Remover" onPress={() => setDraft((d) => ({ ...d, other_metrics: d.other_metrics.filter((_, j) => j !== i) }))} />
              </Row>
            </Row>
          ))}
        </Card>
      ) : null}

      <Card>
        <T variant="h3">Condições da medição</T>
        <T variant="tiny">Ajudam a interpretar variações (hidratação, horário e exercício influenciam a bioimpedância).</T>
        <Toggle label="Em jejum" value={Boolean(draft.conditions?.fasting)} onChange={(v) => setCond({ fasting: v })} />
        <Toggle label="Fez exercício antes" value={Boolean(draft.conditions?.exercised_before)} onChange={(v) => setCond({ exercised_before: v })} />
        <Field label="Observações (hidratação, ciclo menstrual, etc.)" value={draft.conditions?.hydration_note ?? ''} onChangeText={(t) => setCond({ hydration_note: t || null })} />
      </Card>

      {validation.warnings.map((w) => <Notice key={w} kind="warning">{w}</Notice>)}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Row wrap>
        {draft.input === 'import' ? <Badge label="valores extraídos por IA — conferidos por você" tone="warning" /> : <Badge label="entrada manual" />}
      </Row>
      <Button title="Confirmar e salvar" icon="checkmark" onPress={save} loading={busy} disabled={!Object.keys(draft.metrics).length} />
    </Screen>
  );
}
