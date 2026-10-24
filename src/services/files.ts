/**
 * Seleção e envio de arquivos (exames, rótulos, planos) para o storage
 * privado do Supabase, na pasta do próprio usuário.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { newId } from './ids';
import { isCloudConfigured, supabase } from './supabase';

export type FileFolder = 'exames' | 'rotulos' | 'dietas' | 'outros';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

export async function pickDocument(): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? guessMime(a.name) };
}

/** Escolhe um arquivo de texto (JSON ou CSV) e devolve o conteúdo (web e Android). */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (Platform.OS === 'web') {
    const text = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
    return { name: a.name, text };
  }
  const FS = await import('expo-file-system/legacy');
  return { name: a.name, text: await FS.readAsStringAsync(a.uri) };
}

export async function pickImage(source: 'camera' | 'library'): Promise<PickedFile | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permissão de câmera negada. Você pode escolher uma foto da galeria.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.fileName ?? 'foto.jpg', mimeType: a.mimeType ?? 'image/jpeg' };
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/heic': 'heic' };

export async function uploadPrivateFile(userId: string, folder: FileFolder, file: PickedFile): Promise<string> {
  if (!isCloudConfigured) throw new Error('O envio de arquivos exige a conta na nuvem.');
  const path = `${userId}/${folder}/${newId()}.${EXT[file.mimeType] ?? 'bin'}`;
  const body = await (await fetch(file.uri)).arrayBuffer();
  const { error } = await supabase().storage.from('health-files').upload(path, body, { contentType: file.mimeType, upsert: false });
  if (error) throw new Error('Não foi possível enviar o arquivo. Verifique a conexão.');
  return path;
}

export async function deletePrivateFile(path: string): Promise<void> {
  if (!isCloudConfigured) return;
  const { error } = await supabase().storage.from('health-files').remove([path]);
  if (error) throw new Error('Não foi possível excluir o arquivo.');
}

/** URL temporária (5 min) para visualizar o arquivo original. */
export async function signedUrl(path: string): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase().storage.from('health-files').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
