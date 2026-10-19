import React, { useEffect, useState } from 'react';
import { isValidTime, weekdayLabel } from '../domain/dates';
import { countPerDay, defaultSettings, MAX_NOTIFICATIONS_PER_DAY, NOTIFICATION_KINDS, NOTIFICATION_LABELS, planNotifications } from '../domain/notifications';
import type { NotificationSetting } from '../domain/types';
import { expoScheduler, notificationsSupported, requestNotificationPermission, syncNotifications } from '../services/notifications';
import { useStore } from '../state/AppProvider';
import { useCollection } from '../state/hooks';
import { Button, Card, Chip, Field, Notice, NumberField, Row, Screen, T, Toggle } from '../ui/components';
import { confirmAction } from '../ui/confirm';

export default function Notifications() {
  const store = useStore();
  const settings = useCollection<NotificationSetting>('notification_settings');
  const [status, setStatus] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // garante uma linha por tipo (inclui tipos adicionados em versões futuras)
  useEffect(() => {
    if (settings.loading) return;
    const missing = defaultSettings().filter((d) => !settings.data.some((s) => s.kind === d.kind));
    if (missing.length) store.insertMany<NotificationSetting>('notification_settings', missing);
  }, [settings.loading, settings.data, store]);

  const sync = async (list: NotificationSetting[]) => {
    if (!notificationsSupported) return;
    if (list.some((s) => s.enabled)) {
      const ok = await requestNotificationPermission();
      setPermissionDenied(!ok);
      if (!ok) return;
    }
    const r = await syncNotifications(list, await expoScheduler());
    setStatus(`Lembretes atualizados (${r.scheduled} agendados, ${r.cancelled} cancelados).`);
  };

  const update = async (s: NotificationSetting, patch: Partial<NotificationSetting>) => {
    const updated = await store.update<NotificationSetting>('notification_settings', s.id, patch);
    await sync(settings.data.map((x) => (x.id === s.id ? updated : x)));
  };

  const plan = planNotifications(settings.data);
  const perDay = countPerDay(plan);
  const busiest = Math.max(0, ...Object.values(perDay));
  const ordered = NOTIFICATION_KINDS.map((k) => settings.data.find((s) => s.kind === k)).filter((s): s is NotificationSetting => Boolean(s));

  return (
    <Screen>
      {!notificationsSupported ? (
        <Notice kind="warning" title="Limitação da versão web">
          Navegadores não permitem lembretes agendados por este app. Suas preferências ficam salvas e passam a valer no aplicativo Android.
        </Notice>
      ) : null}
      {permissionDenied ? <Notice kind="error">Permissão de notificações negada. Ative nas configurações do Android para receber lembretes.</Notice> : null}
      {busiest > MAX_NOTIFICATIONS_PER_DAY ? <Notice kind="warning">{`Até ${busiest} lembretes em um mesmo dia. Considere reduzir para evitar excesso de mensagens.`}</Notice> : null}
      {status ? <Notice kind="success">{status}</Notice> : null}
      <T variant="small">Cada tipo de lembrete é independente: desativar um não afeta os demais. Mensagens são curtas e sem cobranças.</T>
      {ordered.map((s) => (
        <SettingCard key={s.id} s={s} onChange={(patch) => update(s, patch)} />
      ))}
      <Button
        variant="secondary"
        title="Desativar todos"
        onPress={() => confirmAction('Desativar lembretes', 'Todos os lembretes serão desativados.', async () => {
          for (const s of settings.data) if (s.enabled) await store.update<NotificationSetting>('notification_settings', s.id, { enabled: false });
          await sync(settings.data.map((s) => ({ ...s, enabled: false })));
        })}
      />
    </Screen>
  );
}

function SettingCard({ s, onChange }: { s: NotificationSetting; onChange: (patch: Partial<NotificationSetting>) => void }) {
  const [timesText, setTimesText] = useState(s.times.join(', '));
  const [error, setError] = useState<string | null>(null);
  const isInterval = s.kind === 'water';
  return (
    <Card>
      <Toggle label={NOTIFICATION_LABELS[s.kind]} value={s.enabled} onChange={(v) => onChange({ enabled: v })} />
      {s.enabled ? (
        <>
          {isInterval ? (
            <>
              <Row>
                <CommitField label="Das" initial={s.window_start} time onCommit={(t) => onChange({ window_start: t })} placeholder="08:00" />
                <CommitField label="Até" initial={s.window_end} time onCommit={(t) => onChange({ window_end: t })} placeholder="20:00" />
              </Row>
              <NumberField label="A cada" suffix="min" value={s.interval_min} onChange={(v) => v && v >= 30 && onChange({ interval_min: Math.round(v) })} hint="Mínimo de 30 minutos." />
            </>
          ) : (
            <Field
              label="Horários"
              value={timesText}
              onChangeText={setTimesText}
              onBlur={() => {
                const times = timesText.split(',').map((t) => t.trim()).filter(Boolean);
                if (times.every(isValidTime)) {
                  setError(null);
                  onChange({ times });
                } else setError('Use HH:MM separados por vírgula.');
              }}
              placeholder="12:30, 19:30"
              error={error}
            />
          )}
          <T variant="label">Dias da semana</T>
          <Row wrap>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <Chip
                key={d}
                label={weekdayLabel(d)}
                selected={s.weekdays.includes(d)}
                onPress={() => onChange({ weekdays: s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d].sort() })}
              />
            ))}
          </Row>
          <Row>
            <CommitField label="Silenciar das" initial={s.quiet_start} time onCommit={(t) => onChange({ quiet_start: t })} placeholder="22:00" />
            <CommitField label="até" initial={s.quiet_end} time onCommit={(t) => onChange({ quiet_end: t })} placeholder="07:00" />
          </Row>
          <CommitField label="Mensagem personalizada (opcional)" initial={s.message} onCommit={(t) => onChange({ message: t })} />
        </>
      ) : null}
    </Card>
  );
}

/** Campo que salva ao sair do foco (evita gravar a cada tecla e horários incompletos). */
function CommitField({ label, initial, onCommit, time, placeholder }: { label: string; initial: string | null; onCommit: (v: string | null) => void; time?: boolean; placeholder?: string }) {
  const [text, setText] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Field
      label={label}
      value={text}
      onChangeText={setText}
      placeholder={placeholder}
      error={error}
      style={time ? { flex: 1 } : undefined}
      onBlur={() => {
        const v = text.trim();
        if (time && v && !isValidTime(v)) return setError('Use HH:MM');
        setError(null);
        if (v !== (initial ?? '')) onCommit(v || null);
      }}
    />
  );
}
