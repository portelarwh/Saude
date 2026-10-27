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

export function QuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };
  const date = toISODate(new Date());
  return (
    <Sheet visible={visible} onClose={onClose} title="Registrar">
      <ListItem icon="search" title="Buscar alimento" subtitle="Base TACO, seus alimentos, favoritos e recentes" onPress={() => go({ pathname: '/adicionar', params: { date, meal: currentMeal() } })} />
      <ListItem icon="chatbubble-ellipses-outline" title="Descrever o que comi" subtitle='Ex.: "pão francês com dois ovos e café"' onPress={() => go({ pathname: '/adicionar', params: { date, meal: currentMeal(), tab: 'frase' } })} />
      <ListItem icon="bookmark-outline" title="Refeição salva" subtitle="Repetir uma refeição com um toque" onPress={() => go({ pathname: '/refeicoes', params: { date, meal: currentMeal() } })} />
      <ListItem icon="camera-outline" title="Foto do prato com IA" subtitle="A IA analisa a foto; o app registra e cadastra o que faltar" onPress={() => go({ pathname: '/colar', params: { date, meal: currentMeal(), foto: '1' } })} />
      <ListItem icon="clipboard-outline" title="Colar do meu agente de IA" subtitle="Refeição ou rótulo no formato do app" onPress={() => go({ pathname: '/colar', params: { date, meal: currentMeal() } })} />
      <ListItem icon="barcode-outline" title="Código de barras" onPress={() => go({ pathname: '/adicionar', params: { date, meal: currentMeal(), tab: 'codigo' } })} />
      <ListItem icon="water-outline" iconColor={colors.water} title="Água ou bebida" onPress={() => go('/agua')} />
      <ListItem icon="flask-outline" title="Suplemento" onPress={() => go('/suplementos')} />
      <ListItem icon="walk-outline" title="Atividade física" onPress={() => go('/atividade')} />
      <ListItem icon="scale-outline" title="Peso" onPress={() => go('/peso')} />
      <ListItem icon="happy-outline" title="Como estou me sentindo" subtitle="Bem, barriga estufada ou retenção de líquido" onPress={() => go('/bem-estar')} />
      <ListItem icon="body-outline" title="Exame de bioimpedância" subtitle="Importar PDF ou foto do laudo, ou digitar os valores" onPress={() => go('/composicao/nova')} />
    </Sheet>
  );
}

/** Botão central da barra de abas. */
export function QuickAddTabButton() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Registro rápido"
        style={({ pressed }) => [styles.center, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1, borderColor: colors.surface }]}
      >
        <Ionicons name="add" size={32} color={colors.primaryText} />
      </Pressable>
      <QuickAddSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -22,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    boxShadow: '0px 6px 16px rgba(11, 42, 28, 0.25)',
  },
});
