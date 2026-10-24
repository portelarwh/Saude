/**
 * Colar do agente de IA: o usuário cola o JSON gerado pelo seu agente externo
 * (refeição e/ou rótulo). Refeições são conferidas aqui e salvas para
 * reutilizar; rótulos abrem a conferência do cadastro de alimento.
 */
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AGENT_INSTRUCTIONS, agentLabelToLabelData, parseAgentPaste, reviewAgentMeal, reviewToSavedMeal, type AgentDocument, type MealReview, type ReviewItem } from '../domain/agentFormat';
import { normalizeLabel } from '../domain/labels';
import { scalePer100, sumNutrients } from '../domain/nutrients';
import { savedMealToEntries } from '../domain/savedMeals';
import { MEAL_LABELS, MEAL_ORDER, type DiaryEntry, type MealType, type SavedMeal } from '../domain/types';
import { newId } from '../services/ids';
import { useStore } from '../state/AppProvider';
import { putDraft } from '../state/drafts';
import { useAllFoods, useToday } from '../state/hooks';
import { Badge, Button, Card, Chip, ChipSelect, Field, Notice, NumberField, Row, Screen, T } from '../ui/components';
import { num, SOURCE_LABEL } from '../ui/format';
import { currentMeal } from '../ui/QuickAdd';
import { spacing, useTheme } from '../ui/theme';

type Result = { key: string; doc: AgentDocument; review?: MealReview; saved?: boolean };

export default function PasteFromAgent() {
  const params = useLocalSearchParams<{ date?: string; meal?: MealType }>();
  const router = useRouter();
  const { foods } = useAllFoods();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [copied, setCopied] = useState(false);

  const read = () => {
    setError(null);
    try {
      const docs = parseAgentPaste(text);
      setResults(docs.map((doc, i) => ({ key: `${Date.now()}-${i}`, doc, review: doc.kind === 'meal' ? reviewAgentMeal(doc.meal, foods) : undefined })));
    } catch (e) {
      setResults([]);
      setError((e as Error).message);
    }
  };

  const copyInstructions = async () => {
    await Clipboard.setStringAsync(AGENT_INSTRUCTIONS).catch(() => undefined);
    setCopied(true);
  };

  const openLabel = (r: Result) => {
    if (r.doc.kind !== 'label') return;
    const normalized = normalizeLabel(agentLabelToLabelData(r.doc.label));
    normalized.warnings.unshift('Rótulo transcrito pelo seu agente de IA: compare cada número com a embalagem antes de salvar.');
    const key = putDraft(`agent-label-${r.key}`, { ...normalized, filePath: null });
    router.push({ pathname: '/alimento/novo', params: { draft: key, date: params.date, meal: params.meal } });
  };

  return (
    <Screen>
      <Card>
        <T variant="h3">Formato para o seu agente</T>
        <T variant="small">
          Entregue estas instruções uma vez ao seu agente (por exemplo, nas instruções de um projeto do Claude, de um GPT personalizado ou de um Gem). Depois é só pedir “monte meu almoço” ou enviar a foto de um rótulo e colar a resposta aqui.
        </T>
        <Row wrap>
          <Button small icon="copy-outline" title={copied ? 'Instruções copiadas' : 'Copiar instruções'} onPress={copyInstructions} />
          <Button small variant="secondary" title={showFormat ? 'Ocultar formato' : 'Ver formato'} onPress={() => setShowFormat((s) => !s)} />
        </Row>
        {showFormat ? <T variant="tiny" style={{ fontFamily: 'monospace' }}>{AGENT_INSTRUCTIONS}</T> : null}
      </Card>

      <Field label="Resposta do agente" value={text} onChangeText={setText} multiline placeholder="Cole aqui o bloco ```json da refeição ou do rótulo" />
      <Row wrap>
        <Button
          small
          variant="secondary"
          icon="clipboard-outline"
          title="Colar"
          onPress={async () => {
            const t = await Clipboard.getStringAsync().catch(() => '');
            if (t) setText(t);
          }}
        />
        <Button small icon="sparkles-outline" title="Ler" onPress={read} disabled={text.trim().length < 2} />
      </Row>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {results.map((r) => {
        if (r.doc.kind === 'error') return <Notice key={r.key} kind="error">{`Documento ${r.doc.index + 1}: ${r.doc.message}`}</Notice>;
        if (r.doc.kind === 'label') {
          const l = r.doc.label;
          return (
            <Card key={r.key}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h3" style={{ flex: 1 }}>{[l.produto, l.marca, l.sabor].filter(Boolean).join(' · ')}</T>
                <Badge label="rótulo" tone="info" />
              </Row>
              <T variant="small">{`Porção: ${l.porcao ?? '—'} ${l.unidade ?? 'g'}${l.medida_caseira ? ` (${l.medida_caseira})` : ''}`}</T>
              <Button icon="checkmark-done-outline" title="Conferir e salvar alimento" onPress={() => openLabel(r)} />
            </Card>
          );
        }
        return (
          <MealReviewCard
            key={r.key}
            review={r.review!}
            saved={Boolean(r.saved)}
            foodsDate={params.date}
            defaultMeal={params.meal}
            onChange={(review) => setResults((cur) => cur.map((x) => (x.key === r.key ? { ...x, review } : x)))}
            onSaved={() => setResults((cur) => cur.map((x) => (x.key === r.key ? { ...x, saved: true } : x)))}
          />
        );
      })}

      {results.some((r) => r.saved) ? <Button variant="secondary" icon="bookmark-outline" title="Ver refeições salvas" onPress={() => router.push('/refeicoes')} /> : null}
    </Screen>
  );
}

function itemNutrients(item: ReviewItem) {
  if (!item.choice || !item.amount) return null;
  const per100 = item.choice.kind === 'food' ? item.choice.food.per100 : item.choice.per100;
  return scalePer100(per100, item.amount);
}

function MealReviewCard({ review, saved, foodsDate, defaultMeal, onChange, onSaved }: {
  review: MealReview;
  saved: boolean;
  foodsDate?: string;
  defaultMeal?: MealType;
  onChange: (r: MealReview) => void;
  onSaved: () => void;
}) {
  const store = useStore();
  const today = useToday();
  const { colors } = useTheme();
  const [meal, setMeal] = useState<MealType>(defaultMeal ?? review.meal ?? currentMeal());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const update = (i: number, patch: Partial<ReviewItem>) => onChange({ ...review, items: review.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const totals = sumNutrients(review.items.map(itemNutrients).filter((n): n is NonNullable<typeof n> => Boolean(n)));

  const save = async (alsoLog: boolean) => {
    setError(null);
    try {
      const row = reviewToSavedMeal({ ...review, meal });
      await store.insert<SavedMeal>('saved_meals', row);
      if (alsoLog) {
        await store.insertMany<DiaryEntry>('diary_entries', savedMealToEntries(row, { date: foodsDate ?? today, meal, consumed_at: new Date().toISOString(), groupId: newId() }));
      }
      setDone(alsoLog ? 'Refeição salva e registrada no diário.' : 'Refeição salva. Use em Alimentação › Refeições salvas.');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="h3" style={{ flex: 1 }}>Refeição</T>
        <Badge label="do seu agente" tone="info" />
      </Row>
      <Field label="Nome" value={review.name} onChangeText={(t) => onChange({ ...review, name: t })} />
      <ChipSelect label="Refeição" options={MEAL_ORDER.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} value={meal} onChange={setMeal} />
      {review.items.map((item, i) => {
        const n = itemNutrients(item);
        return (
          <View key={i} style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="label" style={{ flex: 1 }}>{`“${item.input.alimento}”${item.input.medida ? ` · ${item.input.medida}` : ''}`}</T>
              <Button small variant="ghost" title="Remover" onPress={() => onChange({ ...review, items: review.items.filter((_, j) => j !== i) })} />
            </Row>
            <Row wrap>
              {item.candidates.slice(0, 3).map((c) => (
                <Chip key={c.id} label={`${c.name} · ${SOURCE_LABEL[c.source] ?? c.source}`} selected={item.choice?.kind === 'food' && item.choice.food.id === c.id} onPress={() => update(i, { choice: { kind: 'food', food: c } })} />
              ))}
              {item.estimatePer100 ? (
                <Chip label="Estimativa do agente" selected={item.choice?.kind === 'estimate'} onPress={() => update(i, { choice: { kind: 'estimate', per100: item.estimatePer100! } })} />
              ) : null}
            </Row>
            {item.choice?.kind === 'estimate' ? <Badge label="estimativa da IA externa — não verificada" tone="warning" /> : null}
            <NumberField label="Quantidade" suffix={item.choice?.kind === 'food' ? item.choice.food.base_unit : 'g'} value={item.amount} onChange={(v) => update(i, { amount: v })} />
            <T variant="small">{n ? `${num(n.energy_kcal)} kcal · ${num(n.protein_g, 1)} g proteína · ${num(n.carbs_g, 1)} g carbo · ${num(n.fat_g, 1)} g gordura` : 'Escolha o alimento e a quantidade'}</T>
            {item.warnings.map((w) => <T key={w} variant="tiny" color={colors.warning}>{`• ${w}`}</T>)}
          </View>
        );
      })}
      <Notice kind="info" title="Total">
        {`${num(totals.values.energy_kcal)} kcal · ${num(totals.values.protein_g, 1)} g proteína · ${num(totals.values.carbs_g, 1)} g carbo · ${num(totals.values.fat_g, 1)} g gordura · ${num(totals.values.fiber_g, 1)} g fibras`}
      </Notice>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {done ? <Notice kind="success">{done}</Notice> : null}
      {!saved ? (
        <Row wrap>
          <Button icon="bookmark-outline" title="Salvar refeição" onPress={() => save(false)} />
          <Button variant="secondary" icon="add" title="Salvar e registrar agora" onPress={() => save(true)} />
        </Row>
      ) : null}
    </Card>
  );
}
