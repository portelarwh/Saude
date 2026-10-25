import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { View } from 'react-native';
import { IconButton } from '../../ui/components';
import { QuickAddTabButton } from '../../ui/QuickAdd';
import { VersionBadge } from '../../ui/VersionBadge';
import { useTheme } from '../../ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Início', icon: 'home-outline', iconActive: 'home' },
  { name: 'alimentacao', title: 'Diário', icon: 'restaurant-outline', iconActive: 'restaurant' },
  { name: 'progresso', title: 'Progresso', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'assistente', title: 'Assistente', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const tab = (t: (typeof TABS)[number]) => (
    <Tabs.Screen
      key={t.name}
      name={t.name}
      options={{
        title: t.title,
        headerShown: t.name !== 'index',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? t.iconActive : t.icon} color={color as string} size={size} />,
      }}
    />
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 66, paddingBottom: 10, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 20 },
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}>
            <VersionBadge />
            <IconButton icon="person-circle-outline" size={28} label="Perfil e configurações" onPress={() => router.push('/perfil')} />
          </View>
        ),
      }}
    >
      {TABS.slice(0, 2).map(tab)}
      <Tabs.Screen
        name="registrar"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <QuickAddTabButton />
            </View>
          ),
        }}
      />
      {TABS.slice(2).map(tab)}
      <Tabs.Screen name="evolucao" options={{ href: null, title: 'Evolução corporal' }} />
      <Tabs.Screen name="atividades" options={{ href: null, title: 'Atividades' }} />
    </Tabs>
  );
}
