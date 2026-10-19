/**
 * Privacidade e dados (LGPD): consentimentos, transparência sobre IA,
 * exportação, exclusão de arquivos e exclusão da conta.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { formatDateBR } from '../domain/dates';
import type { BodyAssessment, DietPlan } from '../domain/types';
import { ALL_TABLES } from '../data/store';
import { deleteCloudAccount } from '../services/ai';
import { exportAllJSON, exportTableCSV } from '../services/export';
import { deletePrivateFile } from '../services/files';
import { useApp, useStore } from '../state/AppProvider';
import { useCollection, useProfile } from '../state/hooks';
import { Button, Card, Chip, Divider, Field, ListItem, Notice, Row, Screen, T, Toggle } from '../ui/components';
import { confirmAction } from '../ui/confirm';

export default function Privacy() {
  const router = useRouter();
  const store = useStore();
  const { mode, signOut, wipeLocal } = useApp();
  const { profile, save } = useProfile();
  const assessments = useCollection<BodyAssessment>('body_assessments');
  const plans = useCollection<DietPlan>('diet_plans');
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const files = [
    ...assessments.data.filter((a) => a.file_path).map((a) => ({ path: a.file_path!, label: `Exame de ${formatDateBR(a.measured_at)}`, clear: () => store.update<BodyAssessment>('body_assessments', a.id, { file_path: null }) })),
    ...plans.data.filter((p) => p.source_file_path).map((p) => ({ path: p.source_file_path!, label: `Plano "${p.name}"`, clear: () => store.update<DietPlan>('diet_plans', p.id, { source_file_path: null }) })),
  ];

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'success', text: ok });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  const deleteAccount = () =>
    confirmAction('Excluir conta e dados', 'Todos os seus registros, exames e arquivos serão apagados definitivamente. Esta ação não pode ser desfeita.', async () => {
      try {
        if (mode === 'cloud') {
          await deleteCloudAccount();
          await signOut();
        } else {
          await wipeLocal();
          router.replace('/onboarding');
        }
      } catch (e) {
        setMsg({ kind: 'error', text: (e as Error).message });
      }
    });

  return (
    <Screen>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <Card>
        <T variant="h3">Consentimentos</T>
        <T variant="small">{profile?.consent_health_data_at ? `Tratamento de dados de saúde autorizado em ${formatDateBR(profile.consent_health_data_at)}. Para revogar, exclua a conta abaixo (sem esses dados o app não funciona).` : 'Tratamento de dados de saúde não autorizado.'}</T>
        <Toggle
          label="Permitir que a IA leia meus registros e arquivos enviados"
          description="Usado no chat, na leitura de rótulos, exames e dietas. Pode ser revogado a qualquer momento."
          value={Boolean(profile?.consent_ai_at)}
          onChange={(v) => save({ consent_ai_at: v ? new Date().toISOString() : null })}
        />
        <Toggle
          label="Incluir minhas observações de saúde no contexto do chat"
          value={Boolean(profile?.settings?.ai_include_health_notes)}
          onChange={(v) => save({ settings: { ...(profile?.settings ?? {}), ai_include_health_notes: v } })}
        />
      </Card>

      <Card>
        <T variant="h3">Como seus dados são tratados</T>
        <T variant="small">• Finalidade: calcular metas orientativas e acompanhar sua alimentação, hidratação, atividade e composição corporal. Base legal: consentimento específico (LGPD, art. 11, I).</T>
        <T variant="small">{mode === 'cloud' ? '• Armazenamento: banco PostgreSQL (Supabase) com isolamento por usuário (Row Level Security); arquivos em armazenamento privado acessível apenas por você; conexão sempre por HTTPS.' : '• Armazenamento: somente neste aparelho (modo local). Desinstalar o app apaga os dados.'}</T>
        <T variant="small">• IA: quando você usa recursos de IA, o conteúdo necessário (texto, arquivo ou resumo dos registros) é enviado ao provedor de IA (Anthropic) pelo servidor do app, sem chaves no aparelho. Valores extraídos sempre passam pela sua conferência.</T>
        <T variant="small">• Não compartilhamos exames ou históricos com outros usuários nem com terceiros para publicidade.</T>
        <T variant="small">• Registros técnicos (logs) não contêm o conteúdo de exames, refeições ou mensagens.</T>
        <T variant="small">• Seus direitos: acesso, correção (edite qualquer dado), portabilidade (exportação abaixo), exclusão de arquivos e da conta, e revogação do consentimento.</T>
      </Card>

      <Card>
        <T variant="h3">Exportar meus dados</T>
        <Button icon="download-outline" title="Exportar tudo (JSON)" onPress={() => run(() => exportAllJSON(store), 'Exportação gerada.')} />
        <T variant="label">Planilhas (CSV para Excel)</T>
        <Row wrap>
          {ALL_TABLES.filter((t) => !['profiles', 'chat_messages'].includes(t)).map((t) => (
            <Chip key={t} label={t} onPress={() => run(() => exportTableCSV(store, t), `${t}.csv gerado.`)} />
          ))}
        </Row>
      </Card>

      {mode === 'cloud' ? (
        <Card>
          <T variant="h3">Arquivos enviados</T>
          {files.length === 0 ? <T variant="small">Nenhum arquivo armazenado.</T> : null}
          {files.map((f) => (
            <ListItem
              key={f.path}
              icon="document-outline"
              title={f.label}
              right={<Button small variant="ghost" title="Excluir arquivo" onPress={() => confirmAction('Excluir arquivo', 'O arquivo original será apagado; os valores já conferidos permanecem.', () => run(async () => { await deletePrivateFile(f.path); await f.clear(); }, 'Arquivo excluído.'))} />}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <T variant="h3">Excluir conta</T>
        <T variant="small">Apaga definitivamente perfil, registros, exames, arquivos e conversas.</T>
        <Field label='Digite EXCLUIR para confirmar' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
        <Divider />
        <Button variant="danger" icon="trash-outline" title="Excluir conta e todos os dados" onPress={deleteAccount} disabled={confirmText !== 'EXCLUIR'} />
      </Card>
    </Screen>
  );
}
