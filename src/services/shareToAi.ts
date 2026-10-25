/**
 * Envia o arquivo do exame (PDF/foto) direto para o app da IA escolhida pela
 * folha de compartilhamento do celular, com a pergunta junto e copiada.
 * Nada é enviado pelo próprio app: o usuário escolhe o destino.
 */
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export interface ExamFile {
  name: string;
  mimeType: string;
  uri: string;
  file?: File;
}

export async function pickExamFile(): Promise<ExamFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { name: a.name, mimeType: a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'), uri: a.uri, file: a.file ?? undefined };
}

/** 'shared' = abriu a folha de compartilhamento; 'unsupported' = este navegador não compartilha arquivos (ex.: computador). */
export async function shareExamWithPrompt(exam: ExamFile, prompt: string): Promise<'shared' | 'unsupported' | 'cancelled'> {
  try {
    await Clipboard.setStringAsync(prompt);
  } catch {
    // segue: a pergunta também vai no texto compartilhado
  }
  if (Platform.OS === 'web') {
    const file = exam.file ?? new File([await (await fetch(exam.uri)).blob()], exam.name, { type: exam.mimeType });
    const data = { files: [file], text: prompt, title: 'Laudo de bioimpedância' };
    if (typeof navigator === 'undefined' || !navigator.canShare?.(data)) return 'unsupported';
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      return (e as Error).name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return 'unsupported';
  await Sharing.shareAsync(exam.uri, { mimeType: exam.mimeType, dialogTitle: 'Enviar exame para a IA' });
  return 'shared';
}
