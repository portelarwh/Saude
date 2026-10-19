import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { addDays } from '../../domain/dates';
import type { ActivityLog, BodyAssessment, ChatMessage, DiaryEntry, DietPlan, WaterLog } from '../../domain/types';
import { aiChat, AiUnavailableError } from '../../services/ai';
import { buildAiContext, localAnswer, SUGGESTED_QUESTIONS, type ContextInput } from '../../services/aiContext';
import { newId } from '../../services/ids';
import { useApp, useStore } from '../../state/AppProvider';
import { useAllFoods, useCollection, useGoals, useProfile, useToday } from '../../state/hooks';
import { Badge, Button, Chip, IconButton, Notice, Row, T } from '../../ui/components';
import { radius, spacing, useTheme } from '../../ui/theme';

export default function Assistant() {
  const { colors } = useTheme();
  const router = useRouter();
  const store = useStore();
  const { mode } = useApp();
  const today = useToday();
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const { foods, userFoods } = useAllFoods();
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', addDays(today, -6)] });
  const water = useCollection<WaterLog>('water_logs', { gte: ['date', addDays(today, -6)] });
  const activities = useCollection<ActivityLog>('activities', { gte: ['date', addDays(today, -13)] });
  const assessments = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: true } });
  const plans = useCollection<DietPlan>('diet_plans', { eq: { active: true } });
  const [conversationId] = useState(() => newId());
  const messages = useCollection<ChatMessage>('chat_messages', { eq: { conversation_id: conversationId }, order: { field: 'created_at', ascending: true } });
  const [pending, setPending] = useState<{ role: 'user' | 'assistant'; content: string; meta?: string }[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const aiReady = mode === 'cloud' && Boolean(profile?.consent_ai_at);

  const input: ContextInput = useMemo(
    () => ({ today, profile, goalSet, entries: entries.data, waterLogs: water.data, activities: activities.data, assessments: assessments.data, plan: plans.data[0] ?? null, supplements: userFoods.filter((f) => f.is_supplement) }),
    [today, profile, goalSet, entries.data, water.data, activities.data, assessments.data, plans.data, userFoods],
  );

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText('');
    setBusy(true);
    try {
      if (aiReady) {
        setPending([{ role: 'user', content: q }]);
        await aiChat({ conversation_id: conversationId, message: q, context: buildAiContext(input) });
        setPending([]);
        messages.reload();
      } else {
        const answer = localAnswer(q, input, foods) ?? (mode === 'local'
          ? 'No modo local eu respondo perguntas diretas sobre seus registros (proteína e água restantes, manhãs, evolução de gordura, comparação de proteína entre alimentos). Para conversas completas, configure a conta na nuvem com IA.'
          : 'Para respostas completas, autorize o uso de IA em Perfil › Privacidade. Sem IA, respondo perguntas diretas como "Quanto de proteína falta hoje?".');
        await store.insertMany<ChatMessage>('chat_messages', [
          { conversation_id: conversationId, role: 'user', content: q, meta: null },
          { conversation_id: conversationId, role: 'assistant', content: answer, meta: { engine: 'local' } },
        ]);
      }
    } catch (e) {
      setPending([
        { role: 'user', content: q },
        { role: 'assistant', content: e instanceof AiUnavailableError ? e.message : 'Não foi possível responder agora.', meta: 'erro' },
      ]);
      const local = localAnswer(q, input, foods);
      if (local) setPending((p) => [...p, { role: 'assistant', content: local, meta: 'resposta local' }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const all = [...messages.data.map((m) => ({ role: m.role, content: m.content, meta: (m.meta as { engine?: string; food_sources?: string[] } | null)?.engine === 'local' ? 'resposta local, sem IA' : (m.meta as { food_sources?: string[] } | null)?.food_sources?.length ? `fontes: ${(m.meta as { food_sources: string[] }).food_sources.join(', ').toUpperCase()}` : undefined })), ...pending];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {!aiReady ? (
          <Notice
            kind="info"
            title={mode === 'local' ? 'IA indisponível no modo local' : 'Uso de IA não autorizado'}
            action={mode === 'cloud' ? <Button small variant="secondary" title="Privacidade" onPress={() => router.push('/privacidade')} /> : undefined}
          >
            {mode === 'local' ? 'Respondo perguntas diretas calculadas com seus registros. A conversa completa exige a conta na nuvem.' : 'Autorize a IA a ler seus registros para conversar sobre sua alimentação e evolução.'}
          </Notice>
        ) : (
          <T variant="tiny">O assistente usa seus registros e a base TACO. Ele não faz diagnósticos nem altera dietas ou metas prescritas. Recomendações gerais não substituem orientação profissional.</T>
        )}
        {all.length === 0 ? (
          <>
            <T variant="h3">Pergunte, por exemplo:</T>
            <Row wrap>{SUGGESTED_QUESTIONS.map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}</Row>
          </>
        ) : null}
        {all.map((m, i) => (
          <View
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              backgroundColor: m.role === 'user' ? colors.primary : colors.surface,
              borderColor: colors.border,
              borderWidth: m.role === 'user' ? 0 : 1,
              borderRadius: radius.lg,
              padding: spacing.md,
              gap: 4,
            }}
          >
            <T color={m.role === 'user' ? colors.primaryText : colors.text}>{m.content}</T>
            {m.meta ? <Badge label={m.meta} /> : null}
          </View>
        ))}
        {busy ? <T variant="small">Pensando…</T> : null}
      </ScrollView>
      <Row style={{ padding: spacing.md, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Escreva sua pergunta"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Pergunta para o assistente"
          multiline
          style={{ flex: 1, color: colors.text, minHeight: 44, maxHeight: 120, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }}
          onSubmitEditing={() => send(text)}
        />
        <IconButton icon="send" label="Enviar" color={colors.primary} onPress={() => send(text)} />
      </Row>
    </KeyboardAvoidingView>
  );
}
