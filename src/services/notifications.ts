/**
 * Agendamento de lembretes locais. Cada lembrete recebe um identificador
 * "me:<tipo>:<dia>:<HH:MM>"; a sincronização cancela apenas o que deixou de
 * existir e agenda o que é novo, então desativar um tipo não afeta os demais.
 *
 * Limitações reais da plataforma:
 *  - Android 13+ exige permissão POST_NOTIFICATIONS; o usuário pode negar.
 *  - Na versão web (PWA) os lembretes agendados não são suportados pelo
 *    expo-notifications: a tela informa isso.
 *  - Fabricantes com economia agressiva de bateria podem atrasar alertas.
 */
import { Platform } from 'react-native';
import { planNotifications, type PlannedNotification } from '../domain/notifications';
import type { NotificationSetting } from '../domain/types';

export interface Scheduler {
  listIds(): Promise<string[]>;
  schedule(n: PlannedNotification & { identifier: string }): Promise<void>;
  cancel(identifier: string): Promise<void>;
}

const PREFIX = 'me:';

export const notificationsSupported = Platform.OS !== 'web';

export async function syncNotifications(settings: NotificationSetting[], scheduler: Scheduler): Promise<{ scheduled: number; cancelled: number }> {
  const plan = planNotifications(settings).map((p) => ({ ...p, identifier: PREFIX + p.id }));
  const wanted = new Map(plan.map((p) => [p.identifier, p]));
  const existing = (await scheduler.listIds()).filter((id) => id.startsWith(PREFIX));
  let cancelled = 0;
  for (const id of existing) {
    if (!wanted.has(id)) {
      await scheduler.cancel(id);
      cancelled += 1;
    }
  }
  let scheduled = 0;
  const existingSet = new Set(existing);
  for (const [id, p] of wanted) {
    if (existingSet.has(id)) continue;
    await scheduler.schedule(p);
    scheduled += 1;
  }
  return { scheduled, cancelled };
}

/** Implementação real (Android/iOS) com expo-notifications. */
export async function expoScheduler(): Promise<Scheduler> {
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('lembretes', {
      name: 'Lembretes',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return {
    async listIds() {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      return all.map((n) => n.identifier);
    },
    async schedule(n) {
      const [hour, minute] = n.time.split(':').map(Number);
      await Notifications.scheduleNotificationAsync({
        identifier: n.identifier,
        content: { title: n.title, body: n.body, data: { kind: n.kind } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: n.weekday + 1, // expo: 1 = domingo
          hour,
          minute,
          channelId: 'lembretes',
        },
      });
    },
    async cancel(identifier) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    },
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  const Notifications = await import('expo-notifications');
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}
