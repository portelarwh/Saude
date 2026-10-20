/**
 * Painel "Perguntar em outra IA": copia a pergunta, abre Claude / ChatGPT /
 * Gemini (app ou site) e recebe de volta a resposta colada para interpretar.
 */
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { EXTERNAL_PROVIDERS } from '../services/externalAi';
import { Button, Card, Field, Notice, Row, T } from './components';
import { spacing } from './theme';

export function ExternalAiPanel({
  title = 'Perguntar em outra IA',
  description,
  getPrompt,
  onAnswer,
  attachHint,
  disabled,
}: {
  title?: string;
  description: string;
  /** Monta a pergunta no momento do clique (dados sempre atuais). */
  getPrompt: () => string;
  /** Recebe o texto colado; lança erro com mensagem amigável se não conseguir interpretar. */
  onAnswer: (text: string) => Promise<void> | void;
  /** Ex.: "Anexe a foto do rótulo na conversa". */
  attachHint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const launch = async (providerId: string) => {
    const provider = EXTERNAL_PROVIDERS.find((p) => p.id === providerId)!;
    const prompt = getPrompt();
    try {
      await Clipboard.setStringAsync(prompt);
    } catch {
      // segue mesmo sem área de transferência (ex.: navegador sem permissão)
    }
    const url = provider.url(prompt);
    const prefilled = url.includes('?q=');
    setStatus({
      kind: 'info',
      text: `${prefilled ? 'A pergunta já vai preenchida' : 'Pergunta copiada: cole no campo de mensagem'} do ${provider.name}.${attachHint ? ` ${attachHint}` : ''} Depois copie a resposta e volte aqui.`,
    });
    Linking.openURL(url).catch(() => setStatus({ kind: 'error', text: `Não foi possível abrir o ${provider.name}. A pergunta está copiada: abra o app ou site manualmente.` }));
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (t) setAnswer(t);
    } catch {
      setStatus({ kind: 'error', text: 'Não foi possível ler a área de transferência. Cole manualmente no campo.' });
    }
  };

  const interpret = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await onAnswer(answer);
      setAnswer('');
      setStatus({ kind: 'success', text: 'Resposta interpretada. Confira os dados antes de salvar.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <Button variant="secondary" icon="open-outline" title={title} onPress={() => setOpen(true)} disabled={disabled} />;
  }
  return (
    <Card>
      <T variant="h3">{title}</T>
      <T variant="small">{description}</T>
      <T variant="label">1. Copiar a pergunta e abrir</T>
      <Row wrap>
        {EXTERNAL_PROVIDERS.map((p) => (
          <Button key={p.id} small icon="open-outline" title={p.name} onPress={() => launch(p.id)} disabled={disabled} />
        ))}
      </Row>
      <T variant="tiny">Ao usar uma IA externa, a pergunta (e os dados incluídos nela) é enviada a esse serviço, sob os termos dele.</T>
      <View style={{ gap: spacing.sm }}>
        <T variant="label">2. Colar a resposta</T>
        <Field label="Resposta da IA" value={answer} onChangeText={setAnswer} multiline placeholder="Cole aqui a resposta copiada" />
        <Row wrap>
          <Button small variant="secondary" icon="clipboard-outline" title="Colar" onPress={pasteFromClipboard} />
          <Button small icon="sparkles-outline" title="Interpretar" onPress={interpret} loading={busy} disabled={answer.trim().length < 2} />
          <Button small variant="ghost" title="Fechar" onPress={() => setOpen(false)} />
        </Row>
      </View>
      {status ? <Notice kind={status.kind}>{status.text}</Notice> : null}
    </Card>
  );
}
