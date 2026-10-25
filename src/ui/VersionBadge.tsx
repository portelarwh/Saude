import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { formatReleaseDate, versionCheckResult } from '../domain/appUpdate';
import { fetchPublishedVersion, forceUpdate, lastVersionCheck, markVersionCheck, runningBuild } from '../services/appUpdate';
import { APP_RELEASE_DATE, APP_VERSION } from '../version';
import { Button, Notice, Row, Sheet, T } from './components';
import { font, radius, spacing, useTheme } from './theme';

/** Versão pequena no canto superior; toque abre "Sobre a versão" com verificação/atualização forçada. */
export function VersionBadge() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Date | null>(null);
  const [status, setStatus] = useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const web = Platform.OS === 'web';

  const show = () => {
    setLast(lastVersionCheck());
    setStatus(null);
    setOpen(true);
  };

  const check = async () => {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Verificando…' });
    const published = await fetchPublishedVersion();
    markVersionCheck();
    setLast(new Date());
    const r = versionCheckResult({ version: APP_VERSION, build: runningBuild() }, published);
    setStatus({ kind: r.status === 'offline' ? 'error' : r.status === 'newer' ? 'success' : 'info', text: r.message });
    setBusy(false);
    if (r.status === 'newer') setTimeout(() => forceUpdate(), 600);
  };

  return (
    <>
      <Pressable
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`Versão ${APP_VERSION}. Ver detalhes da versão`}
        hitSlop={8}
        style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}
      >
        <T variant="tiny" color={colors.muted} style={{ fontSize: font.tiny - 1 }}>{`v${APP_VERSION}`}</T>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Sobre a versão">
        <View style={{ gap: spacing.xs }}>
          <T>{`Versão atual: ${APP_VERSION}`}</T>
          <T>{`Publicada em: ${formatReleaseDate(APP_RELEASE_DATE)}`}</T>
          {web ? <T>{`Última verificação: ${last ? last.toLocaleString('pt-BR') : 'nunca'}`}</T> : null}
        </View>
        {status ? <Notice kind={status.kind}>{status.text}</Notice> : null}
        {web ? (
          <>
            <Row>
              <Button variant="secondary" title="Fechar" onPress={() => setOpen(false)} style={{ flex: 1 }} />
              <Button icon="refresh" title="Verificar agora" onPress={check} loading={busy} style={{ flex: 1 }} />
            </Row>
            <Button small variant="ghost" title="Forçar atualização (recarregar do servidor)" onPress={() => forceUpdate()} />
            <T variant="tiny">Atualizar não apaga seus registros: só troca os arquivos do app.</T>
          </>
        ) : (
          <>
            <T variant="small">No aplicativo Android, versões novas chegam ao instalar o APK atualizado.</T>
            <Button variant="secondary" title="Fechar" onPress={() => setOpen(false)} />
          </>
        )}
      </Sheet>
    </>
  );
}
