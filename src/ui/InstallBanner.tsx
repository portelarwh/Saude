import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INSTALL_TEXT, installBannerMode, type InstallBannerMode } from '../domain/installPrompt';
import { dismissInstall, installContext, onInstallChange, promptInstall } from '../services/install';
import { Button, IconButton, Row, T } from './components';
import { radius, spacing, useTheme } from './theme';

/** Barra no topo sugerindo instalar o app no celular (só na versão web). */
export function InstallBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const compute = () => {
    const c = installContext();
    return c ? installBannerMode(c) : null;
  };
  const [mode, setMode] = useState<InstallBannerMode | null>(compute);
  useEffect(() => onInstallChange(() => setMode(compute())), []);
  if (!mode) return null;
  const text = INSTALL_TEXT[mode];
  const close = () => {
    dismissInstall();
    setMode(null);
  };
  return (
    <View
      accessibilityRole="alert"
      style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.md, right: spacing.md, zIndex: 60, backgroundColor: colors.hero, borderRadius: radius.lg, padding: spacing.md, boxShadow: '0px 6px 18px rgba(0,0,0,0.25)' }}
    >
      <Row style={{ alignItems: 'center', gap: spacing.md }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 10 }} accessibilityLabel="" />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="label" color={colors.heroText}>{text.title}</T>
          <T variant="tiny" color={colors.heroText}>{text.message}</T>
        </View>
        <IconButton icon="close" label="Agora não" onPress={close} color={colors.heroText} />
      </Row>
      {text.action ? (
        <Row style={{ justifyContent: 'flex-end', marginTop: spacing.sm }}>
          <Button small variant="secondary" icon="download-outline" title={text.action} onPress={async () => { if (await promptInstall()) setMode(null); else close(); }} />
        </Row>
      ) : mode === 'ios' ? <Ionicons name="share-outline" size={18} color={colors.heroText} style={{ alignSelf: 'center', marginTop: 4 }} /> : null}
    </View>
  );
}
