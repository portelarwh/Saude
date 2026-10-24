import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { foodBaseInfo } from '../data/reference';
import { appliedFoodBaseUpdate, availableUpdate, type UpdateNotice } from '../domain/appUpdate';
import { applyUpdate, fetchPublishedVersion, runningBuild } from '../services/appUpdate';
import { useProfile } from '../state/hooks';
import { Button, Notice, Row } from './components';
import { spacing } from './theme';

const CHECK_EVERY_MS = 10 * 60 * 1000;

/** Aviso "Atualizar base de dados" / "Atualização disponível" ao abrir ou voltar ao app. */
export function UpdateBanner({ trackSeen }: { trackSeen: boolean }) {
  const [available, setAvailable] = useState<UpdateNotice | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const last = useRef(0);

  const check = useCallback(async () => {
    if (Date.now() - last.current < CHECK_EVERY_MS) return;
    last.current = Date.now();
    setAvailable(availableUpdate(runningBuild(), foodBaseInfo(), await fetchPublishedVersion()));
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  return (
    <>
      {available && !dismissed ? (
        <Banner notice={available} onClose={() => setDismissed(true)} action={<Button small icon="refresh" title="Atualizar" onPress={applyUpdate} />} />
      ) : null}
      {trackSeen ? <AppliedNotice /> : null}
    </>
  );
}

function AppliedNotice() {
  const { profile, save } = useProfile();
  const current = useMemo(() => foodBaseInfo(), []);
  const seen = profile?.settings?.seen_food_base ?? null;
  const pending = Boolean(profile?.onboarding_completed) && seen?.atualizado_em !== current.atualizado_em;
  // undefined = ainda não avaliado nesta abertura
  const [notice, setNotice] = useState<UpdateNotice | null | undefined>(undefined);
  if (pending && notice === undefined) setNotice(appliedFoodBaseUpdate(seen, current));

  useEffect(() => {
    if (pending && profile) save({ settings: { ...(profile.settings ?? {}), seen_food_base: current } });
  }, [pending, profile, current, save]);

  return notice ? <Banner notice={notice} onClose={() => setNotice(null)} /> : null;
}

function Banner({ notice, onClose, action }: { notice: UpdateNotice; onClose: () => void; action?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: insets.bottom + 76, zIndex: 50 }} pointerEvents="box-none">
      <Notice
        kind={notice.kind === 'available' ? 'info' : 'success'}
        title={notice.title}
        action={
          <Row>
            {action}
            <Button small variant="ghost" title={action ? 'Depois' : 'OK'} onPress={onClose} />
          </Row>
        }
      >
        {notice.message}
      </Notice>
    </View>
  );
}
