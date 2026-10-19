import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { IconButton } from '../../ui/components';
import { useTheme } from '../../ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Início', icon: 'home-outline' },
  { name: 'alimentacao', title: 'Alimentação', icon: 'restaurant-outline' },
  { name: 'evolucao', title: 'Evolução', icon: 'trending-down-outline' },
  { name: 'atividades', title: 'Atividades', icon: 'walk-outline' },
  { name: 'assistente', title: 'Assistente IA', icon: 'chatbubbles-outline' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11 },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => <IconButton icon="person-circle-outline" size={26} label="Perfil e configurações" onPress={() => router.push('/perfil')} />,
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            headerTitle: t.name === 'index' ? 'Meu Equilíbrio' : t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
