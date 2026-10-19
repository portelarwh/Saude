import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { isValidBarcode, lookupBarcode } from '../services/openFoodFacts';
import { putDraft } from '../state/drafts';
import { useAllFoods } from '../state/hooks';
import { Button, Notice, Row, Screen, T } from '../ui/components';
import { spacing } from '../ui/theme';

export default function Scanner() {
  const { date, meal } = useLocalSearchParams<{ date?: string; meal?: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const { userFoods } = useAllFoods();
  const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string; code?: string } | null>(null);
  const busy = useRef(false);

  const onScan = async ({ data }: { data: string }) => {
    if (busy.current) return;
    const code = data.trim();
    if (!isValidBarcode(code)) return;
    busy.current = true;
    setStatus({ kind: 'info', text: `Consultando ${code}…` });
    const mine = userFoods.find((f) => f.barcode === code);
    if (mine) {
      router.replace({ pathname: '/alimento/[id]', params: { id: mine.id, date, meal } });
      return;
    }
    const r = await lookupBarcode(code);
    if (r.status === 'found') {
      const key = putDraft(`off-${code}`, { ...r.label, filePath: null });
      router.replace({ pathname: '/alimento/novo', params: { draft: key, date, meal } });
      return;
    }
    setStatus(
      r.status === 'not_found'
        ? { kind: 'info', text: 'Produto não encontrado. Cadastre pela foto do rótulo ou manualmente.', code }
        : { kind: 'error', text: r.message, code },
    );
    busy.current = false;
  };

  if (!permission) return <Screen><T>Verificando permissão da câmera…</T></Screen>;
  if (!permission.granted) {
    return (
      <Screen>
        <Notice kind="info" title="Permissão da câmera">
          Para ler o código de barras, permita o acesso à câmera. Você também pode digitar o código na tela anterior.
        </Notice>
        <Button title="Permitir câmera" onPress={requestPermission} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={status?.code ? undefined : onScan}
      />
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <T variant="small">Aponte para o código de barras da embalagem.</T>
        {status ? <Notice kind={status.kind}>{status.text}</Notice> : null}
        {status?.code ? (
          <Row wrap>
            <Button small variant="secondary" title="Foto do rótulo" onPress={() => router.replace({ pathname: '/adicionar', params: { date, meal, tab: 'rotulo' } })} />
            <Button small variant="secondary" title="Cadastro manual" onPress={() => router.replace({ pathname: '/alimento/novo', params: { date, meal, barcode: status.code } })} />
            <Button small variant="ghost" title="Escanear de novo" onPress={() => setStatus(null)} />
          </Row>
        ) : null}
      </View>
    </View>
  );
}
