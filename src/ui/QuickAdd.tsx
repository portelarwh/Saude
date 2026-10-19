/** Botão flutuante de registro rápido, presente nas abas principais. */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { toISODate } from '../domain/dates';
import type { MealType } from '../domain/types';
import { ListItem, Sheet } from './components';
import { useTheme } from './theme';

export function currentMeal(now = new Date()): MealType {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 9.5) return 'breakfast';
  if (h < 11.5) return 'morning_snack';
  if (h < 14.5) return 'lunch';
  if (h < 18) return 'afternoon_snack';
  if (h < 21.5) return 'dinner';
  return 'supper';
}

export function QuickAdd() {
  const { colors } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const go = (href: Parameters<typeof router.push>[0]) => {
    setOpen(false);
    router.push(href);
  };
  const date = toISODate(new Date());
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Registro rápido"
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
      >
        <Ionicons name="add" size={30} color={colors.primaryText} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Registrar">
        <ListItem icon="restaurant-outline" title="Refeição" subtitle="Busca, frase, rótulo ou código de barras" onPress={() => go({ pathname: '/adicionar', params: { date, meal: currentMeal() } })} />
        <ListItem icon="chatbubble-ellipses-outline" title="Descrever o que comi" subtitle='Ex.: "pão francês com dois ovos e café"' onPress={() => go({ pathname: '/adicionar', params: { date, meal: currentMeal(), tab: 'frase' } })} />
        <ListItem icon="water-outline" iconColor={colors.water} title="Água ou bebida" onPress={() => go('/agua')} />
        <ListItem icon="flask-outline" title="Suplemento" onPress={() => go('/suplementos')} />
        <ListItem icon="walk-outline" title="Atividade física" onPress={() => go('/atividade')} />
        <ListItem icon="scale-outline" title="Peso" onPress={() => go('/peso')} />
        <ListItem icon="body-outline" title="Avaliação corporal" onPress={() => go('/composicao/nova')} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
