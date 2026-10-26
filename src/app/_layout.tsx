import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/AppProvider';
import { useProfile } from '../state/hooks';
import { Loading } from '../ui/components';
import { dark, light, ThemeContext } from '../ui/theme';
import { InstallBanner } from '../ui/InstallBanner';
import { UpdateBanner } from '../ui/UpdateBanner';

function ThemedStack() {
  const system = useColorScheme();
  const { ready, store, mode } = useApp();
  const segments = useSegments();
  const router = useRouter();

  const inAuth = segments[0] === 'login';
  useEffect(() => {
    if (!ready) return;
    if (mode === 'cloud' && !store && !inAuth) router.replace('/login');
    if (store && inAuth) router.replace('/');
  }, [ready, store, mode, inAuth, router]);

  if (!ready || (!store && !inAuth)) {
    return <ThemeContext.Provider value={{ colors: system === 'dark' ? dark : light, scheme: system === 'dark' ? 'dark' : 'light' }}><Loading /></ThemeContext.Provider>;
  }
  return store ? <WithProfile systemScheme={system} /> : <Shell scheme={system === 'dark' ? 'dark' : 'light'} />;
}

function WithProfile({ systemScheme }: { systemScheme: ReturnType<typeof useColorScheme> }) {
  const { profile, loading } = useProfile();
  const segments = useSegments();
  const router = useRouter();
  const pref = profile?.settings?.theme ?? 'system';
  const scheme: 'light' | 'dark' = pref === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : pref;

  const inOnboarding = ['onboarding', 'composicao', 'privacidade', 'fontes'].includes(segments[0] ?? '');
  useEffect(() => {
    if (loading) return;
    if (!profile?.onboarding_completed && !inOnboarding) router.replace('/onboarding');
  }, [loading, profile, inOnboarding, router]);

  if (loading) return <ThemeContext.Provider value={{ colors: scheme === 'dark' ? dark : light, scheme }}><Loading /></ThemeContext.Provider>;
  return <Shell scheme={scheme} trackSeen />;
}

function Shell({ scheme, trackSeen = false }: { scheme: 'light' | 'dark'; trackSeen?: boolean }) {
  const colors = scheme === 'dark' ? dark : light;
  const theme = useMemo(() => ({ colors, scheme }), [colors, scheme]);
  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="agua" options={{ title: 'Hidratação' }} />
        <Stack.Screen name="adicionar" options={{ title: 'Adicionar alimento' }} />
        <Stack.Screen name="alimento/[id]" options={{ title: 'Alimento' }} />
        <Stack.Screen name="alimento/novo" options={{ title: 'Cadastrar alimento' }} />
        <Stack.Screen name="scanner" options={{ title: 'Código de barras' }} />
        <Stack.Screen name="suplementos" options={{ title: 'Meus suplementos' }} />
        <Stack.Screen name="receitas" options={{ title: 'Receitas' }} />
        <Stack.Screen name="receita" options={{ title: 'Receita' }} />
        <Stack.Screen name="composicao/nova" options={{ title: 'Nova avaliação corporal' }} />
        <Stack.Screen name="composicao/[id]" options={{ title: 'Avaliação corporal' }} />
        <Stack.Screen name="peso" options={{ title: 'Registrar peso' }} />
        <Stack.Screen name="metas" options={{ title: 'Minhas metas' }} />
        <Stack.Screen name="perfil" options={{ title: 'Perfil' }} />
        <Stack.Screen name="notificacoes" options={{ title: 'Notificações' }} />
        <Stack.Screen name="privacidade" options={{ title: 'Privacidade e dados' }} />
        <Stack.Screen name="relatorios" options={{ title: 'Relatórios' }} />
        <Stack.Screen name="dieta" options={{ title: 'Meu plano alimentar' }} />
        <Stack.Screen name="atividade" options={{ title: 'Registrar atividade' }} />
        <Stack.Screen name="fontes" options={{ title: 'Fontes de dados' }} />
        <Stack.Screen name="colar" options={{ title: 'Colar do agente de IA' }} />
        <Stack.Screen name="refeicoes" options={{ title: 'Refeições salvas' }} />
        <Stack.Screen name="base-alimentos" options={{ title: 'Base de alimentos' }} />
        <Stack.Screen name="bem-estar" options={{ title: 'Como você está' }} />
      </Stack>
      <UpdateBanner trackSeen={trackSeen} />
      <InstallBanner />
    </ThemeContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ThemedStack />
      </AppProvider>
    </SafeAreaProvider>
  );
}
