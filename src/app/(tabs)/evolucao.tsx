import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { compareAssessments, METRICS, movingAverage, series, trend } from '../../domain/bodyComposition';
import { formatDateBR } from '../../domain/dates';
import type { BodyAssessment, BodyMetricKey, WeightEntry } from '../../domain/types';
import { useCollection, useProfile } from '../../state/hooks';
import { LineChart } from '../../ui/charts';
import { Button, Card, Chip, EmptyState, ListItem, Row, Screen, SectionHeader, T } from '../../ui/components';
import { ComparisonView } from '../../ui/ComparisonView';
import { num, signed } from '../../ui/format';
import { QuickAdd } from '../../ui/QuickAdd';
import { useTheme } from '../../ui/theme';

const CHART_METRICS: BodyMetricKey[] = ['fat_mass_kg', 'body_fat_pct', 'skeletal_muscle_mass_kg', 'fat_free_mass_kg', 'visceral_fat_level', 'total_body_water_l', 'waist_cm'];

export default function Evolution() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile } = useProfile();
  const weights = useCollection<WeightEntry>('weight_entries', { order: { field: 'measured_at', ascending: true } });
  const assessments = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: true } });
  const available = CHART_METRICS.filter((k) => series(assessments.data, k).length > 0);
  const [metric, setMetric] = useState<BodyMetricKey>('fat_mass_kg');
  const shownMetric = available.includes(metric) ? metric : available[0];

  const weightPoints = weights.data.map((w) => ({ date: w.measured_at, value: w.weight_kg }));
  const smooth = useMemo(() => movingAverage(weightPoints, 7), [weightPoints]);
  const first = assessments.data[0];
  const last = assessments.data[assessments.data.length - 1];
  const overall = first && last && first.id !== last.id ? compareAssessments(first, last) : null;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Row wrap>
          <Button small icon="scale-outline" title="Registrar peso" onPress={() => router.push('/peso')} />
          <Button small icon="body-outline" variant="secondary" title="Nova avaliação" onPress={() => router.push('/composicao/nova')} />
          <Button small icon="document-text-outline" variant="secondary" title="Relatórios" onPress={() => router.push('/relatorios')} />
        </Row>

        <Card>
          <T variant="h3">Peso</T>
          {weightPoints.length ? (
            <>
              <LineChart title="Peso" points={weightPoints} smooth={weightPoints.length >= 3 ? smooth : undefined} unit="kg" color={colors.chart.primary} />
              <T variant="small">
                {`Início: ${num(weightPoints[0].value, 1)} kg · Atual (média 7 dias): ${num(smooth[smooth.length - 1].value, 1)} kg · Variação: ${signed(smooth[smooth.length - 1].value - weightPoints[0].value, 1)} kg${profile?.target_weight_kg ? ` · Meta: ${num(profile.target_weight_kg, 1)} kg` : ''}`}
              </T>
            </>
          ) : (
            <T variant="small">Nenhuma pesagem registrada.</T>
          )}
        </Card>

        <SectionHeader title="Minha composição corporal" />
        {!assessments.data.length ? (
          <EmptyState
            icon="body-outline"
            title="Nenhuma avaliação"
            message="Importe o PDF ou foto da sua bioimpedância, ou digite os valores. O app compara automaticamente com o exame anterior e o inicial."
            action={<Button title="Adicionar avaliação" onPress={() => router.push('/composicao/nova')} />}
          />
        ) : (
          <>
            {available.length ? (
              <Card>
                <Row wrap>
                  {available.map((k) => <Chip key={k} label={METRICS[k].label} selected={k === shownMetric} onPress={() => setMetric(k)} />)}
                </Row>
                {shownMetric ? (
                  <>
                    <LineChart title={METRICS[shownMetric].label} points={series(assessments.data, shownMetric)} unit={METRICS[shownMetric].unit} />
                    <Row style={{ justifyContent: 'space-between' }}>
                      {[30, 60, 90].map((w) => {
                        const t = trend(assessments.data, shownMetric, w);
                        return (
                          <View key={w} style={{ alignItems: 'center', flex: 1 }}>
                            <T variant="label">{`${w} dias`}</T>
                            <T variant="small">{t.direction === 'insufficient' ? 'dados insuficientes' : t.direction === 'flat' ? 'estável' : `${signed(t.change, 1)} ${METRICS[shownMetric].unit}`}</T>
                            {t.consistent ? <T variant="tiny" color={colors.primary}>consistente</T> : null}
                          </View>
                        );
                      })}
                    </Row>
                    <T variant="tiny">Tendências consideram as avaliações no período; “consistente” exige 3 ou mais avaliações na mesma direção. Oscilações isoladas não são destacadas.</T>
                  </>
                ) : null}
              </Card>
            ) : null}

            {overall ? (
              <>
                <SectionHeader title="Inicial × atual" />
                <ComparisonView comparison={overall} />
              </>
            ) : null}

            <Card>
              <T variant="h3">Avaliações</T>
              {[...assessments.data].reverse().map((a) => (
                <ListItem
                  key={a.id}
                  icon="body-outline"
                  title={formatDateBR(a.measured_at)}
                  subtitle={[a.device_model ?? a.device_manufacturer, a.metrics.body_fat_pct ? `${num(a.metrics.body_fat_pct.value, 1)}% gordura` : null, a.metrics.weight_kg ? `${num(a.metrics.weight_kg.value, 1)} kg` : null].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/composicao/[id]', params: { id: a.id } })}
                />
              ))}
            </Card>
          </>
        )}
      </Screen>
      <QuickAdd />
    </View>
  );
}
