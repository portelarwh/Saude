/**
 * Exporta os alimentos cadastrados (rótulos, receitas, suplementos, do agente)
 * no formato da base do sistema, e importa um arquivo desses neste aparelho.
 */
import React, { useState } from 'react';
import { baseFoods } from '../data/reference';
import { FoodBundleError, exportableFoods, newFoodsFrom, parseFoodBundle } from '../domain/foodBundle';
import type { Food } from '../domain/types';
import { exportFoodBase } from '../services/export';
import { pickJsonText } from '../services/files';
import { newId } from '../services/ids';
import { useStore } from '../state/AppProvider';
import { useAllFoods } from '../state/hooks';
import { Button, Card, Field, Notice, Screen, T } from '../ui/components';

export default function FoodBase() {
  const store = useStore();
  const { foods, userFoods } = useAllFoods();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = exportableFoods(userFoods);
  const inBase = baseFoods().length;
  const estimated = mine.filter((f) => f.verification === 'estimated').length;

  const doExport = async () => {
    setMsg(null);
    try {
      const n = await exportFoodBase(baseFoods(), userFoods);
      setMsg({ kind: 'success', text: `Arquivo alimentos-base.json gerado com ${n} alimento(s). Envie-o para incluir na base do sistema.` });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  const importText = async (text: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const { foods: incoming, skipped } = parseFoodBundle(text);
      const fresh = newFoodsFrom(incoming, foods);
      if (fresh.length) {
        await store.insertMany<Food>('foods', fresh.map((f) => ({ ...f, id: `user:${newId()}` })));
      }
      const parts = [`${fresh.length} alimento(s) novo(s) importado(s)`];
      if (incoming.length - fresh.length) parts.push(`${incoming.length - fresh.length} já existia(m)`);
      if (skipped) parts.push(`${skipped} ignorado(s) por estarem incompletos`);
      setMsg({ kind: fresh.length ? 'success' : 'info', text: parts.join(' · ') + '.' });
      setPasted('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof FoodBundleError ? e.message : `Não foi possível importar: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    try {
      const f = await pickJsonText();
      if (f) await importText(f.text);
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <Screen>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <Card>
        <T variant="h3">Exportar para a base do sistema</T>
        <T variant="small">{`Você tem ${mine.length} alimento(s) cadastrado(s) (rótulos, receitas, suplementos e itens do agente). A base do sistema já tem ${inBase} além da TACO.`}</T>
        <T variant="small">O arquivo junta a base atual com os seus cadastros. Para que novas instalações já venham com eles, substitua no projeto o arquivo src/data/reference/alimentos-base.json por este (ou me envie o arquivo).</T>
        {estimated ? <Notice kind="warning">{`${estimated} alimento(s) têm valores estimados e continuam marcados como estimativa na base.`}</Notice> : null}
        <Button icon="download-outline" title="Exportar alimentos-base.json" onPress={doExport} disabled={!mine.length && !inBase} />
      </Card>
      <Card>
        <T variant="h3">Importar neste aparelho</T>
        <T variant="small">Traz alimentos de um arquivo exportado (de outro aparelho ou de um backup). Itens que você já tem não são duplicados.</T>
        <Button variant="secondary" icon="folder-open-outline" title="Escolher arquivo" onPress={pickFile} loading={busy} />
        <Field label="Ou cole o conteúdo do arquivo" value={pasted} onChangeText={setPasted} multiline placeholder='{"formato": "meu-equilibrio/alimentos-v1", ...}' style={{ minHeight: 80 }} />
        <Button variant="secondary" title="Importar texto colado" onPress={() => importText(pasted)} disabled={!pasted.trim()} loading={busy} />
      </Card>
    </Screen>
  );
}
