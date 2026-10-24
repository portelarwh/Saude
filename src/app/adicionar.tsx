/**
 * Adicionar alimento a uma refeição — quatro métodos:
 *  1. Pesquisa (nome, marca, categoria, ingrediente, sinônimos)
 *  2. Linguagem natural (IA quando disponível; parser local como alternativa)
 *  3. Foto do rótulo (IA extrai, usuário confere)
 *  4. Código de barras (Open Food Facts)
 * Toda sugestão passa por conferência antes de entrar no diário.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { buildEntry, buildSupplementEntry } from '../domain/entries';
import { searchFoods } from '../domain/foodSearch';
import { parseMealLocally, updateParsedItem, type ParsedItem, type ParsedMeal } from '../domain/mealParser';
import { normalizeLabel } from '../domain/labels';
import { sumNutrients } from '../domain/nutrients';
import { MEAL_LABELS, type DiaryEntry, type Food, type MealType } from '../domain/types';
import { aiExtractLabel, aiParseMeal, AiUnavailableError, searchUsda, type UsdaFood } from '../services/ai';
import { pickImage, uploadPrivateFile } from '../services/files';
import { buildExternalPrompt, parseExternalLabel, parseExternalMeal } from '../services/externalAi';
import { labelExtractionToLabelData, mealParseToParsedMeal } from '../services/imports';
import { isValidBarcode, lookupBarcode } from '../services/openFoodFacts';
import { useApp, useStore } from '../state/AppProvider';
import { putDraft } from '../state/drafts';
import { useAllFoods, useCollection, useProfile, useToday } from '../state/hooks';
import { Badge, Button, Card, Chip, Field, ListItem, Notice, NumberField, Row, Screen, T } from '../ui/components';
import { num, SOURCE_LABEL } from '../ui/format';
import { ExternalAiPanel } from '../ui/ExternalAi';
import { FoodRow } from '../ui/FoodRow';
import { spacing, useTheme } from '../ui/theme';

type Tab = 'buscar' | 'frase' | 'rotulo' | 'codigo';

export default function AddFood() {
  const params = useLocalSearchParams<{ date?: string; meal?: MealType; tab?: Tab }>();
  const today = useToday();
  const date = params.date ?? today;
  const meal = (params.meal ?? 'breakfast') as MealType;
  const [tab, setTab] = useState<Tab>(params.tab ?? 'buscar');
  const router = useRouter();

  const openFood = (food: Food) => router.push({ pathname: '/alimento/[id]', params: { id: food.id, date, meal } });

  return (
    <Screen>
      <T variant="small">{`Adicionando em ${MEAL_LABELS[meal]}`}</T>
      <Row wrap>
        <Chip icon="search" label="Buscar" selected={tab === 'buscar'} onPress={() => setTab('buscar')} />
        <Chip icon="chatbubble-ellipses-outline" label="Descrever" selected={tab === 'frase'} onPress={() => setTab('frase')} />
        <Chip icon="camera-outline" label="Rótulo" selected={tab === 'rotulo'} onPress={() => setTab('rotulo')} />
        <Chip icon="barcode-outline" label="Código" selected={tab === 'codigo'} onPress={() => setTab('codigo')} />
      </Row>
      {tab === 'buscar' && <SearchTab onPick={openFood} date={date} meal={meal} />}
      {tab === 'frase' && <PhraseTab date={date} meal={meal} />}
      {tab === 'rotulo' && <LabelTab date={date} meal={meal} />}
      {tab === 'codigo' && <BarcodeTab date={date} meal={meal} onPick={openFood} />}
    </Screen>
  );
}

function SearchTab({ onPick, date, meal }: { onPick: (f: Food) => void; date: string; meal: MealType }) {
  const router = useRouter();
  const { mode } = useApp();
  const { foods, userFoods } = useAllFoods();
  const [q, setQ] = useState('');
  const [usda, setUsda] = useState<{ loading: boolean; results: UsdaFood[] | null; error: string | null }>({ loading: false, results: null, error: null });

  const searchExternal = async () => {
    setUsda({ loading: true, results: null, error: null });
    try {
      setUsda({ loading: false, results: await searchUsda(q.trim()), error: null });
    } catch (e) {
      setUsda({ loading: false, results: null, error: `${(e as Error).message} Você pode cadastrar o alimento manualmente.` });
    }
  };

  const pickUsda = (f: UsdaFood) => {
    const normalized = normalizeLabel(
      { product_name: f.name, brand: null, flavor: null, variant: null, barcode: null, serving_size: 100, serving_unit: 'g', household_measure: null, basis: 'as_sold', per_serving: null, per_100: f.per100, ingredients_text: null },
      'usda',
    );
    normalized.food.source_ref = f.source_ref;
    normalized.warnings.unshift('Dados do USDA FoodData Central (EUA), por 100 g. Traduza o nome se desejar e confira os valores.');
    const key = putDraft(`usda-${f.id}`, { ...normalized, filePath: null });
    router.push({ pathname: '/alimento/novo', params: { draft: key, date, meal } });
  };
  const recent = useCollection<DiaryEntry>('diary_entries', { order: { field: 'created_at', ascending: false }, limit: 60 });
  const favorites = useCollection<{ id: string; food_id: string }>('food_favorites');
  const hits = useMemo(() => (q.trim().length >= 2 ? searchFoods(foods, q, 40) : []), [foods, q]);
  const byId = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const out: Food[] = [];
    for (const e of recent.data) {
      const f = byId.get(e.food_id);
      if (f && !seen.has(f.id) && !f.is_supplement) {
        seen.add(f.id);
        out.push(f);
      }
    }
    return out.slice(0, 10);
  }, [recent.data, byId]);
  const favoriteFoods = favorites.data.map((f) => byId.get(f.food_id)).filter((f): f is Food => Boolean(f));

  return (
    <>
      <Field label="Pesquisar alimento" value={q} onChangeText={setQ} placeholder="Ex.: pão francês, peito de frango, iogurte" autoFocus returnKeyType="search" />
      {q.trim().length >= 2 ? (
        <Card>
          {mode === 'cloud' ? (
            <Button small variant="ghost" icon="globe-outline" title="Buscar também no USDA (em inglês)" onPress={searchExternal} loading={usda.loading} />
          ) : null}
          {usda.error ? <Notice kind="warning">{usda.error}</Notice> : null}
          {usda.results?.length === 0 ? <T variant="small">Nada encontrado no USDA.</T> : null}
          {usda.results?.map((f) => (
            <ListItem key={f.id} title={f.name} subtitle={`USDA · ${num(f.per100.energy_kcal)} kcal · ${num(f.per100.protein_g, 1)} g prot. / 100 g`} onPress={() => pickUsda(f)} />
          ))}
          {hits.length === 0 ? (
            <>
              <T variant="small">Nenhum alimento encontrado na base.</T>
              <Button variant="secondary" icon="create-outline" title="Cadastrar manualmente" onPress={() => router.push({ pathname: '/alimento/novo', params: { name: q, date, meal } })} />
            </>
          ) : (
            hits.map(({ food }) => <FoodRow key={food.id} food={food} onPress={() => onPick(food)} />)
          )}
        </Card>
      ) : (
        <>
          {favoriteFoods.length ? (
            <Card>
              <T variant="h3">Favoritos</T>
              {favoriteFoods.map((f) => <FoodRow key={f.id} food={f} onPress={() => onPick(f)} />)}
            </Card>
          ) : null}
          {recentFoods.length ? (
            <Card>
              <T variant="h3">Recentes</T>
              {recentFoods.map((f) => <FoodRow key={f.id} food={f} onPress={() => onPick(f)} />)}
            </Card>
          ) : null}
          {userFoods.filter((f) => !f.is_supplement).length ? (
            <Card>
              <T variant="h3">Meus alimentos e receitas</T>
              {userFoods.filter((f) => !f.is_supplement).slice(0, 15).map((f) => <FoodRow key={f.id} food={f} onPress={() => onPick(f)} />)}
            </Card>
          ) : null}
          <Row wrap>
            <Button small variant="secondary" icon="bookmark-outline" title="Refeições salvas" onPress={() => router.push({ pathname: '/refeicoes', params: { date, meal } })} />
            <Button small variant="secondary" icon="clipboard-outline" title="Colar do agente" onPress={() => router.push({ pathname: '/colar', params: { date, meal } })} />
          </Row>
          <Button variant="secondary" icon="create-outline" title="Cadastrar alimento" onPress={() => router.push({ pathname: '/alimento/novo', params: { date, meal } })} />
        </>
      )}
    </>
  );
}


function PhraseTab({ date, meal }: { date: string; meal: MealType }) {
  const store = useStore();
  const router = useRouter();
  const { mode } = useApp();
  const { profile } = useProfile();
  const { foods } = useAllFoods();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedMeal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const interpret = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'cloud' && profile?.consent_ai_at) {
        const r = await aiParseMeal(text);
        setParsed(mealParseToParsedMeal(r, foods));
      } else {
        setParsed(parseMealLocally(text, foods));
        setNotice(mode === 'cloud' ? 'Uso de IA não autorizado: interpretação feita pelo leitor local do app.' : 'Modo local: interpretação feita pelo leitor local do app (sem IA).');
      }
    } catch (e) {
      setParsed(parseMealLocally(text, foods));
      setNotice(`${e instanceof AiUnavailableError ? e.message : 'IA indisponível.'} Usamos o leitor local do app; confira os itens.`);
    } finally {
      setBusy(false);
    }
  };

  const update = (idx: number, item: ParsedItem) => setParsed((p) => (p ? { ...p, items: p.items.map((x, i) => (i === idx ? item : x)) } : p));
  const removeItem = (idx: number) => setParsed((p) => (p ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p));
  const ready = parsed?.items.filter((i) => i.food && i.amount && i.amount > 0) ?? [];
  const totals = sumNutrients(ready.map((i) => i.nutrients ?? {}));

  const confirm = async () => {
    const consumed_at = new Date().toISOString();
    await store.insertMany<DiaryEntry>(
      'diary_entries',
      ready.map((i) => {
        const opts = { date, meal, origin: 'natural_language' as const, consumed_at };
        // suplementos mantêm doses e compostos (ex.: vitamina B12 em mcg)
        const e = i.food!.is_supplement && i.food!.serving_size ? buildSupplementEntry(i.food!, i.amount! / i.food!.serving_size, opts) : buildEntry(i.food!, i.amount!, opts);
        return { ...e, note: i.notes.join(', ') || null };
      }),
    );
    router.back();
  };

  return (
    <>
      <Field
        label="Descreva o que você comeu"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Ex.: Comi um pão francês com dois ovos mexidos e café sem açúcar."
        hint="Dica: use o microfone do teclado para ditar."
      />
      <Button title="Interpretar" icon="sparkles-outline" onPress={interpret} loading={busy} disabled={text.trim().length < 2} />
      {notice ? <Notice kind="info">{notice}</Notice> : null}
      {!(mode === 'cloud' && profile?.consent_ai_at) ? (
        <ExternalAiPanel
          title="Interpretar com outra IA"
          description="O app copia a frase com instruções para a IA separar alimentos e quantidades (sem calorias). Cole a resposta: os nutrientes continuam vindo da base do app."
          getPrompt={() => buildExternalPrompt('meal', { text })}
          onAnswer={(t) => {
            setParsed(mealParseToParsedMeal(parseExternalMeal(t), foods));
            setNotice('Itens identificados por IA externa. Confira alimentos e quantidades.');
          }}
          disabled={text.trim().length < 2}
        />
      ) : null}
      {parsed ? (
        <>
          <Notice kind="warning" title="Confira antes de adicionar">
            Quantidades marcadas como “estimada” usam porções caseiras de referência. Os nutrientes vêm da base de alimentos, não da IA.
          </Notice>
          {parsed.items.map((item, idx) => (
            <Card key={idx}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="label">{`"${item.text}"`}</T>
                <Button small variant="ghost" title="Remover" onPress={() => removeItem(idx)} />
              </Row>
              {item.food ? (
                <>
                  <T variant="h3">{item.food.name}</T>
                  <Row wrap>
                    <Badge label={SOURCE_LABEL[item.food.source] ?? item.food.source} tone="info" />
                    {item.amountEstimated ? <Badge label="quantidade estimada" tone="warning" /> : null}
                    {item.notes.map((n) => <Badge key={n} label={n} />)}
                  </Row>
                  {item.candidates.length > 1 ? (
                    <Row wrap>
                      {item.candidates.slice(0, 4).map((c) => (
                        <Chip key={c.id} label={c.name} selected={c.id === item.food?.id} onPress={() => update(idx, updateParsedItem(item, { food: c }))} />
                      ))}
                    </Row>
                  ) : null}
                  <NumberField label={`Quantidade (${item.food.base_unit})`} value={item.amount} onChange={(v) => v && update(idx, updateParsedItem(item, { amount: v }))} hint={item.measureLabel ?? undefined} />
                  <T variant="small">{item.nutrients ? `${num(item.nutrients.energy_kcal)} kcal · ${num(item.nutrients.protein_g, 1)} g proteína · ${num(item.nutrients.carbs_g, 1)} g carbo · ${num(item.nutrients.fat_g, 1)} g gordura` : 'Informe a quantidade'}</T>
                </>
              ) : (
                <Button small variant="secondary" title="Pesquisar manualmente" onPress={() => router.push({ pathname: '/adicionar', params: { date, meal } })} />
              )}
              {item.questions.map((q) => <T key={q} variant="small" color={colors.warning}>{`• ${q}`}</T>)}
            </Card>
          ))}
          {parsed.questions.filter((q) => !parsed.items.some((i) => i.questions.includes(q))).map((q) => <Notice key={q} kind="info">{q}</Notice>)}
          <Card>
            <T variant="h3">Prévia</T>
            <T>{`${num(totals.values.energy_kcal)} kcal · ${num(totals.values.protein_g, 1)} g proteína · ${num(totals.values.carbs_g, 1)} g carbo · ${num(totals.values.fat_g, 1)} g gordura`}</T>
            <Button title={`Adicionar ${ready.length} item(ns)`} icon="checkmark" onPress={confirm} disabled={!ready.length} />
          </Card>
        </>
      ) : null}
    </>
  );
}

function LabelTab({ date, meal }: { date: string; meal: MealType }) {
  const router = useRouter();
  const { mode, store } = useApp();
  const { profile } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiReady = mode === 'cloud' && Boolean(profile?.consent_ai_at);

  const run = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const file = await pickImage(source);
      if (!file) return;
      setBusy(true);
      const path = await uploadPrivateFile(store!.userId, 'rotulos', file);
      const ex = await aiExtractLabel(path);
      const normalized = normalizeLabel(labelExtractionToLabelData(ex));
      if (ex.confidence === 'low') normalized.warnings.unshift('A leitura teve baixa confiança (foto borrada, cortada ou com reflexo). Confira com atenção.');
      if (ex.unreadable_fields.length) normalized.warnings.push(`Campos ilegíveis: ${ex.unreadable_fields.join(', ')}.`);
      const key = putDraft(`label-${Date.now()}`, { ...normalized, filePath: path });
      router.push({ pathname: '/alimento/novo', params: { draft: key, date, meal } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <T variant="small">Fotografe a tabela nutricional inteira, com boa luz e sem reflexo. A IA transcreve os valores, normaliza por 100 g/ml e por porção, e você confere antes de salvar.</T>
      {!aiReady ? (
        <Notice kind="info" title={mode === 'local' ? 'Leitura por IA indisponível no modo local' : 'Uso de IA não autorizado'}>
          {mode === 'local' ? 'Configure o Supabase para usar a leitura de rótulos. Você pode cadastrar o rótulo digitando os valores.' : 'Autorize o uso de IA em Perfil › Privacidade, ou digite os valores do rótulo.'}
        </Notice>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button icon="camera" title="Fotografar rótulo" onPress={() => run('camera')} loading={busy} />
          <Button variant="secondary" icon="images-outline" title="Escolher da galeria" onPress={() => run('library')} disabled={busy} />
        </View>
      )}
      {!aiReady ? (
        <ExternalAiPanel
          title="Ler o rótulo com outra IA"
          description="Abra o Claude, ChatGPT ou Gemini, anexe a foto do rótulo e envie a pergunta copiada. Cole a resposta aqui: os valores abrem na tela de conferência."
          attachHint="Anexe a foto do rótulo antes de enviar."
          getPrompt={() => buildExternalPrompt('label', {})}
          onAnswer={(t) => {
            const ex = parseExternalLabel(t);
            const normalized = normalizeLabel(labelExtractionToLabelData(ex));
            normalized.warnings.unshift('Valores transcritos por IA externa: compare cada número com o rótulo.');
            if (ex.unreadable_fields.length) normalized.warnings.push(`Campos ilegíveis: ${ex.unreadable_fields.join(', ')}.`);
            const key = putDraft(`ext-label-${Date.now()}`, { ...normalized, filePath: null });
            router.push({ pathname: '/alimento/novo', params: { draft: key, date, meal } });
          }}
        />
      ) : null}
      {error ? <Notice kind="error" action={<Button small variant="secondary" title="Digitar valores" onPress={() => router.push({ pathname: '/alimento/novo', params: { date, meal } })} />}>{error}</Notice> : null}
      <Button variant="secondary" icon="clipboard-outline" title="Colar rótulo do meu agente de IA" onPress={() => router.push({ pathname: '/colar', params: { date, meal } })} />
      <Button variant="ghost" icon="create-outline" title="Digitar valores do rótulo" onPress={() => router.push({ pathname: '/alimento/novo', params: { date, meal } })} />
    </>
  );
}

function BarcodeTab({ date, meal, onPick }: { date: string; meal: MealType; onPick: (f: Food) => void }) {
  const router = useRouter();
  const { userFoods } = useAllFoods();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const lookup = async () => {
    setMessage(null);
    const c = code.trim();
    if (!isValidBarcode(c)) return setMessage({ kind: 'error', text: 'Código inválido. Confira os dígitos (EAN-8, EAN-13 ou UPC).' });
    const mine = userFoods.find((f) => f.barcode === c);
    if (mine) return onPick(mine);
    setBusy(true);
    const r = await lookupBarcode(c);
    setBusy(false);
    if (r.status === 'found') {
      const key = putDraft(`off-${c}`, { ...r.label, filePath: null });
      router.push({ pathname: '/alimento/novo', params: { draft: key, date, meal } });
    } else if (r.status === 'not_found') {
      setMessage({ kind: 'info', text: 'Produto não encontrado no Open Food Facts. Cadastre pela foto do rótulo ou digitando os valores.' });
    } else {
      setMessage({ kind: 'error', text: r.message });
    }
  };

  return (
    <>
      <Button icon="scan-outline" title="Escanear com a câmera" onPress={() => router.push({ pathname: '/scanner', params: { date, meal } })} />
      <Field label="Ou digite o código" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="7891234567890" />
      <Button variant="secondary" title="Consultar" onPress={lookup} loading={busy} disabled={code.trim().length < 8} />
      {message ? (
        <Notice
          kind={message.kind}
          action={
            <Row wrap>
              <Button small variant="secondary" title="Foto do rótulo" onPress={() => router.push({ pathname: '/adicionar', params: { date, meal, tab: 'rotulo' } })} />
              <Button small variant="secondary" title="Cadastro manual" onPress={() => router.push({ pathname: '/alimento/novo', params: { date, meal, barcode: code.trim() } })} />
            </Row>
          }
        >
          {message.text}
        </Notice>
      ) : null}
      <T variant="tiny">Dados de produtos: Open Food Facts (openfoodfacts.org), base colaborativa sob licença ODbL. Confira sempre com a embalagem.</T>
    </>
  );
}
