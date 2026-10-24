/**
 * Base de alimentos: exporta os cadastros no formato da base do sistema e
 * importa em massa (planilha CSV ou arquivo exportado), com pré-visualização.
 */
import React, { useState } from 'react';
import { baseFoods } from '../data/reference';
import { exportableFoods, FoodBundleError, newFoodsFrom, parseFoodFile } from '../domain/foodBundle';
import type { CsvIssue } from '../domain/foodCsv';
import type { Food } from '../domain/types';
import { exportFoodBase, exportFoodCsvTemplate } from '../services/export';
import { pickTextFile } from '../services/files';
import { newId } from '../services/ids';
import { useStore } from '../state/AppProvider';
import { useAllFoods } from '../state/hooks';
import { Badge, Button, Card, Field, ListItem, Notice, Row, Screen, T } from '../ui/components';
import { num } from '../ui/format';

interface Preview {
  fresh: Food[];
  existing: number;
  errors: CsvIssue[];
  warnings: CsvIssue[];
}

export default function FoodBase() {
  const store = useStore();
  const { foods, userFoods } = useAllFoods();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = exportableFoods(userFoods);
  const inBase = baseFoods().length;
  const estimated = mine.filter((f) => f.verification === 'estimated').length;

  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  const doExport = () =>
    run(async () => {
      const n = await exportFoodBase(baseFoods(), userFoods);
      setMsg({ kind: 'success', text: `Arquivo alimentos-base.json gerado com ${n} alimento(s). Envie-o para incluir na base do sistema.` });
    });

  const read = (text: string) => {
    setMsg(null);
    try {
      const r = parseFoodFile(text);
      const fresh = newFoodsFrom(r.foods, foods);
      setPreview({ fresh, existing: r.foods.length - fresh.length, errors: r.errors, warnings: r.warnings });
      if (!r.foods.length && !r.errors.length) setMsg({ kind: 'info', text: 'Nenhum alimento encontrado no arquivo.' });
    } catch (e) {
      setPreview(null);
      setMsg({ kind: 'error', text: e instanceof FoodBundleError ? e.message : `Não foi possível ler: ${(e as Error).message}` });
    }
  };

  const confirm = () =>
    run(async () => {
      if (!preview) return;
      setBusy(true);
      try {
        await store.insertMany<Food>('foods', preview.fresh.map((f) => ({ ...f, id: `user:${newId()}` })));
        setMsg({ kind: 'success', text: `${preview.fresh.length} alimento(s) importado(s). Já aparecem na busca. Para levar à base do sistema, use Exportar.` });
        setPreview(null);
        setPasted('');
      } finally {
        setBusy(false);
      }
    });

  return (
    <Screen>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <Card>
        <T variant="h3">Importação em massa</T>
        <T variant="small">Planilha CSV (Excel ou Google Planilhas) com um alimento por linha, ou um arquivo alimentos-base.json. Você confere antes de salvar; itens que já existem não são duplicados.</T>
        <Row wrap>
          <Button small variant="secondary" icon="folder-open-outline" title="Escolher arquivo" onPress={() => run(async () => { const f = await pickTextFile(); if (f) read(f.text); })} />
          <Button small variant="ghost" icon="document-outline" title="Baixar modelo de planilha" onPress={() => run(exportFoodCsvTemplate)} />
        </Row>
        <Field label="Ou cole o conteúdo (CSV ou JSON)" value={pasted} onChangeText={setPasted} multiline placeholder={'nome;unidade;kcal;proteina_g\nCuscuz;g;113;2,2'} style={{ minHeight: 80 }} />
        <Button variant="secondary" title="Ler texto colado" onPress={() => read(pasted)} disabled={!pasted.trim()} />
      </Card>

      {preview ? (
        <Card>
          <T variant="h3">Conferir importação</T>
          <Row wrap>
            <Badge label={`${preview.fresh.length} novo(s)`} tone="primary" />
            {preview.existing ? <Badge label={`${preview.existing} já existe(m)`} tone="neutral" /> : null}
            {preview.errors.length ? <Badge label={`${preview.errors.length} com erro`} tone="danger" /> : null}
          </Row>
          {preview.errors.length ? (
            <Notice kind="error" title="Linhas não importadas">{preview.errors.slice(0, 8).map((e) => `Linha ${e.line}: ${e.message}`).join('\n') + (preview.errors.length > 8 ? `\n… e mais ${preview.errors.length - 8}` : '')}</Notice>
          ) : null}
          {preview.warnings.length ? <Notice kind="warning">{preview.warnings.slice(0, 5).map((w) => (w.line ? `Linha ${w.line}: ` : '') + w.message).join('\n')}</Notice> : null}
          {preview.fresh.slice(0, 20).map((f, i) => (
            <ListItem
              key={i}
              title={[f.name, f.brand, f.flavor].filter(Boolean).join(' · ')}
              subtitle={`por 100 ${f.base_unit}: ${num(f.per100.energy_kcal)} kcal · ${num(f.per100.protein_g, 1)} g prot. · ${num(f.per100.carbs_g, 1)} g carb. · ${num(f.per100.fat_g, 1)} g gord.${f.verification === 'estimated' ? ' · estimativa' : ''}`}
            />
          ))}
          {preview.fresh.length > 20 ? <T variant="tiny">{`… e mais ${preview.fresh.length - 20}.`}</T> : null}
          <Row>
            <Button title={`Importar ${preview.fresh.length} alimento(s)`} onPress={confirm} disabled={!preview.fresh.length} loading={busy} style={{ flex: 2 }} />
            <Button variant="ghost" title="Cancelar" onPress={() => setPreview(null)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <T variant="h3">Exportar para a base do sistema</T>
        <T variant="small">{`Você tem ${mine.length} alimento(s) cadastrado(s) (rótulos, receitas, suplementos, importados e itens do agente). A base do sistema já tem ${inBase} além da TACO.`}</T>
        <T variant="small">O arquivo junta a base atual com os seus cadastros. Coloque-o na pasta dados/alimentos do repositório (ou me envie): na próxima publicação ele entra na base e quem abrir o app recebe o aviso “Atualizar base de dados”.</T>
        {estimated ? <Notice kind="warning">{`${estimated} alimento(s) têm valores estimados e continuam marcados como estimativa na base.`}</Notice> : null}
        <Button icon="download-outline" title="Exportar alimentos-base.json" onPress={doExport} disabled={!mine.length && !inBase} />
      </Card>
    </Screen>
  );
}
