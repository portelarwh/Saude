/**
 * Cadastro/conferência de alimento: manual, rótulo lido por IA ou produto do
 * Open Food Facts. Nada é salvo sem a revisão do usuário; campos vazios
 * ficam como "não informado" (nunca zero).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { COMPOUND_UNITS, compoundsToRecord, recordToCompounds, type Compound, type CompoundUnit } from '../../domain/compounds';
import { validateSupplement } from '../../domain/entries';
import { findDuplicate } from '../../domain/foodSearch';
import { inferredTags, normalizeTags, suggestTags } from '../../domain/foodTags';
import { normalizeLabel, type LabelData, type NormalizedLabel } from '../../domain/labels';
import { isKnown, type Nutrients } from '../../domain/nutrients';
import type { Food, FoodSource, SupplementCategory } from '../../domain/types';
import { newId } from '../../services/ids';
import { useStore } from '../../state/AppProvider';
import { dropDraft, takeDraft } from '../../state/drafts';
import { useAllFoods } from '../../state/hooks';
import { SUPPLEMENT_LABELS } from '../../ui/labels';
import { TagEditor } from '../../ui/TagEditor';
import { View } from 'react-native';
import { Button, Card, Chip, ChipSelect, Field, Notice, NumberField, Row, Screen, T, Toggle } from '../../ui/components';


const FIELDS: { key: keyof Nutrients; label: string; unit: string }[] = [
  { key: 'energy_kcal', label: 'Valor energético', unit: 'kcal' },
  { key: 'carbs_g', label: 'Carboidratos', unit: 'g' },
  { key: 'sugars_g', label: 'Açúcares totais', unit: 'g' },
  { key: 'added_sugars_g', label: 'Açúcares adicionados', unit: 'g' },
  { key: 'protein_g', label: 'Proteínas', unit: 'g' },
  { key: 'fat_g', label: 'Gorduras totais', unit: 'g' },
  { key: 'saturated_fat_g', label: 'Gorduras saturadas', unit: 'g' },
  { key: 'trans_fat_g', label: 'Gorduras trans', unit: 'g' },
  { key: 'fiber_g', label: 'Fibras alimentares', unit: 'g' },
  { key: 'sodium_mg', label: 'Sódio', unit: 'mg' },
];

type Draft = NormalizedLabel & { filePath: string | null };

const NO_MACROS: Nutrients = { energy_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export default function NewFood() {
  const params = useLocalSearchParams<{ draft?: string; edit?: string; name?: string; barcode?: string; date?: string; meal?: string; supplement?: string }>();
  const router = useRouter();
  const store = useStore();
  const { userFoods } = useAllFoods();
  const draft = useMemo(() => takeDraft<Draft>(params.draft), [params.draft]);
  const editing = params.edit ? userFoods.find((f) => f.id === params.edit) ?? null : null;
  const base = draft?.food ?? editing;

  const [name, setName] = useState(base?.name ?? params.name ?? '');
  const [brand, setBrand] = useState(base?.brand ?? '');
  const [flavor, setFlavor] = useState(base?.flavor ?? '');
  const [variant, setVariant] = useState(base?.variant ?? '');
  const [unit, setUnit] = useState<'g' | 'ml'>(base?.base_unit ?? 'g');
  const [basis, setBasis] = useState<LabelData['basis']>(base?.label_basis ?? 'as_sold');
  const [serving, setServing] = useState<number | null>(base?.serving_size ?? null);
  const [measure, setMeasure] = useState(base?.serving_label ?? '');
  const [barcode, setBarcode] = useState(base?.barcode ?? params.barcode ?? '');
  const [ingredients, setIngredients] = useState(base?.ingredients_text ?? '');
  const [inputMode, setInputMode] = useState<'serving' | 'per100'>(draft || editing ? 'per100' : 'serving');
  const [values, setValues] = useState<Nutrients>(base ? { ...base.per100 } : {});
  const [isSupplement, setIsSupplement] = useState(base?.is_supplement ?? params.supplement === '1');
  const [category, setCategory] = useState<SupplementCategory | null>(base?.supplement_category ?? (params.supplement === '1' ? 'whey_concentrate' : null));
  const [compounds, setCompounds] = useState<{ name: string; amount: number | null; unit: CompoundUnit }[]>(() => recordToCompounds(base?.compounds_per_serving));
  const [noMacros, setNoMacros] = useState<boolean>(() =>
    Boolean(base?.is_supplement && (base.supplement_category === 'vitamin_mineral' || base.supplement_category === 'multivitamin') && (['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const).every((k) => base.per100[k] === 0)),
  );
  const [fromLabel, setFromLabel] = useState(Boolean(draft) || base?.source === 'label');
  const [tags, setTags] = useState<string[]>(base?.tags ?? []);
  const [error, setError] = useState<string | null>(null);

  const label: LabelData = {
    product_name: name.trim() || null,
    brand: brand.trim() || null,
    flavor: flavor.trim() || null,
    variant: variant.trim() || null,
    barcode: barcode.trim() || null,
    serving_size: noMacros ? serving ?? 1 : serving,
    serving_unit: unit,
    household_measure: measure.trim() || (noMacros ? '1 cápsula' : null),
    basis,
    per_serving: noMacros ? null : inputMode === 'serving' ? values : null,
    per_100: noMacros ? NO_MACROS : inputMode === 'per100' ? values : null,
    ingredients_text: ingredients.trim() || null,
    is_supplement: isSupplement,
    supplement_category: isSupplement ? category : null,
    compounds_per_serving: isSupplement ? compoundsToRecord(compounds.filter((c): c is Compound => c.amount !== null)) : null,
  };
  const source: FoodSource = draft?.food.source === 'off' ? 'off' : fromLabel ? 'label' : 'manual';
  const normalized = normalizeLabel(label, source);
  const supplementProblems = isSupplement ? validateSupplement({ ...(normalized.food as Food), id: 'x', user_id: 'x' }) : [];

  const save = async () => {
    setError(null);
    if (normalized.errors.length) return setError(normalized.errors.join(' '));
    if (supplementProblems.length) return setError(supplementProblems.join(' '));
    const dup = editing ? null : findDuplicate(userFoods, normalized.food);
    if (dup) return setError(`Já existe um cadastro igual: "${dup.name}". Edite o existente para evitar duplicidade.`);
    const id = editing?.id ?? `user:${newId()}`;
    const row = { ...normalized.food, id, tags: normalizeTags(tags), verified_at: new Date().toISOString().slice(0, 10) };
    if (editing) await store.update<Food>('foods', id, row);
    else await store.insert<Food>('foods', row);
    dropDraft(params.draft);
    if (params.date && params.meal) router.replace({ pathname: '/alimento/[id]', params: { id, date: params.date, meal: params.meal } });
    else router.back();
  };

  const warnings = [...(draft?.warnings ?? []), ...normalized.warnings.filter((w) => !(draft?.warnings ?? []).includes(w))];

  return (
    <Screen>
      {draft ? (
        <Notice kind="warning" title="Confira os dados extraídos">
          Compare cada valor com a embalagem e corrija o que for preciso. Os dados só serão salvos depois que você tocar em Salvar.
        </Notice>
      ) : null}
      <Card>
        <Field label="Nome do produto" value={name} onChangeText={setName} />
        <Row>
          <Field label="Marca" value={brand} onChangeText={setBrand} style={{ flex: 1 }} />
          <Field label="Sabor" value={flavor} onChangeText={setFlavor} style={{ flex: 1 }} />
        </Row>
        <Field label="Versão/variante" value={variant} onChangeText={setVariant} placeholder="Ex.: zero lactose, 900 g, refil" />
        <TagEditor
          value={tags}
          onChange={setTags}
          inferred={inferredTags({ name, category: null, aliases: [], is_supplement: isSupplement }).filter((t) => !tags.includes(t))}
          suggestions={suggestTags({ name, category: null, aliases: [], is_supplement: isSupplement, tags }, userFoods).filter((t) => !inferredTags({ name, category: null, aliases: [], is_supplement: isSupplement }).includes(t))}
        />
        <Toggle label="Valores copiados do rótulo do produto" value={fromLabel} onChange={setFromLabel} />
        <Toggle label="É um suplemento" value={isSupplement} onChange={(v) => { setIsSupplement(v); if (v && !category) setCategory('whey_concentrate'); }} />
        {isSupplement ? (
          <ChipSelect
            label="Categoria"
            options={(Object.keys(SUPPLEMENT_LABELS) as SupplementCategory[]).map((c) => ({ value: c, label: SUPPLEMENT_LABELS[c] }))}
            value={category}
            onChange={(c) => {
              setCategory(c);
              if (c === 'vitamin_mineral' || c === 'multivitamin') setNoMacros(true);
              if (c === 'creatine' && !compounds.some((x) => /creatin/i.test(x.name))) setCompounds((cur) => [...cur, { name: 'Creatina', amount: null, unit: 'g' }]);
            }}
          />
        ) : null}
      </Card>

      {isSupplement ? (
        <Card>
          <T variant="h3">Compostos por dose</T>
          <T variant="tiny">Creatina, vitaminas, minerais, cafeína… São registrados à parte e não alteram calorias nem macronutrientes.</T>
          {compounds.map((c, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Row style={{ alignItems: 'flex-end' }}>
                <Field label="Composto" value={c.name} onChangeText={(t) => setCompounds((cur) => cur.map((x, j) => (j === i ? { ...x, name: t } : x)))} placeholder="Vitamina B12" style={{ flex: 1 }} />
                <NumberField label="Quantidade" value={c.amount} onChange={(v) => setCompounds((cur) => cur.map((x, j) => (j === i ? { ...x, amount: v } : x)))} style={{ width: 110 }} />
              </Row>
              <Row wrap>
                {COMPOUND_UNITS.map((u) => <Chip key={u} label={u} selected={c.unit === u} onPress={() => setCompounds((cur) => cur.map((x, j) => (j === i ? { ...x, unit: u } : x)))} />)}
                <Button small variant="ghost" title="Remover" onPress={() => setCompounds((cur) => cur.filter((_, j) => j !== i))} />
              </Row>
            </View>
          ))}
          <Button small variant="secondary" icon="add" title="Adicionar composto" onPress={() => setCompounds((cur) => [...cur, { name: category === 'creatine' ? 'Creatina' : '', amount: null, unit: category === 'creatine' ? 'g' : 'mcg' }])} />
          <Toggle
            label="Não contém calorias nem macronutrientes"
            description="Cápsulas/comprimidos de vitaminas e minerais. Confirme no rótulo: calorias, proteínas, carboidratos e gorduras serão registrados como 0."
            value={noMacros}
            onChange={setNoMacros}
          />
        </Card>
      ) : null}

      <Card>
        <T variant="h3">Porção</T>
        <ChipSelect label="Unidade" options={[{ value: 'g', label: 'gramas (g)' }, { value: 'ml', label: 'mililitros (ml)' }]} value={unit} onChange={setUnit} />
        <Row>
          <NumberField label={isSupplement ? 'Dose (porção)' : 'Porção'} suffix={unit} value={serving} onChange={setServing} style={{ flex: 1 }} hint={noMacros ? 'Opcional para cápsulas sem macros (padrão: 1).' : undefined} />
          <Field label="Medida caseira" value={measure} onChangeText={setMeasure} placeholder={isSupplement ? '1 dosador' : '1 pote'} style={{ flex: 1 }} />
        </Row>
        <ChipSelect
          label="Os valores da tabela referem-se ao produto"
          options={[{ value: 'as_sold', label: 'Como vendido' }, { value: 'prepared', label: 'Preparado' }, { value: 'unknown', label: 'Não indicado' }]}
          value={basis}
          onChange={setBasis}
        />
      </Card>

      {noMacros ? null : (
      <Card>
        <T variant="h3">Tabela nutricional</T>
        <ChipSelect
          label="Valores informados"
          options={[{ value: 'serving', label: 'Por porção' }, { value: 'per100', label: `Por 100 ${unit}` }]}
          value={inputMode}
          onChange={(m) => {
            // converte os valores já digitados para o novo modo
            if (m !== inputMode) setValues(m === 'per100' ? normalized.food.per100 : normalized.perServing);
            setInputMode(m);
          }}
        />
        {FIELDS.map((f) => (
          <NumberField key={f.key} label={f.label} suffix={f.unit} value={values[f.key] ?? null} onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))} placeholder="não informado" />
        ))}
        {serving && Object.values(values).some(isKnown) ? (
          <T variant="small">{`Por 100 ${unit}: ${normalized.food.per100.energy_kcal ?? '—'} kcal · ${normalized.food.per100.protein_g ?? '—'} g proteína`}</T>
        ) : null}
      </Card>
      )}

      <Card>
        <Field label="Código de barras" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />
        <Field label="Ingredientes" value={ingredients} onChangeText={setIngredients} multiline />
      </Card>

      {warnings.map((w) => <Notice key={w} kind="warning">{w}</Notice>)}
      {supplementProblems.map((w) => <Notice key={w} kind="error">{w}</Notice>)}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button title={editing ? 'Salvar alterações' : 'Salvar alimento'} icon="checkmark" onPress={save} />
    </Screen>
  );
}
