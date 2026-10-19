import { createContext, useContext } from 'react';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string; // texto sobre primary
  primarySoft: string;
  water: string;
  waterSoft: string;
  accent: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  /** Cores de séries de gráfico (validadas para daltonismo e contraste). */
  chart: { primary: string; water: string; accent: string; grid: string };
}

export const light: Palette = {
  bg: '#F4F7F3',
  surface: '#FFFFFF',
  surfaceAlt: '#EBF1EC',
  text: '#13201A',
  textSecondary: '#46574D',
  muted: '#6A7B71',
  border: '#D9E3DB',
  primary: '#1C5E3F',
  primaryText: '#FFFFFF',
  primarySoft: '#DCEEE2',
  water: '#2563A8',
  waterSoft: '#DDE9F7',
  accent: '#9A6516',
  danger: '#B42318',
  dangerSoft: '#FCE8E6',
  warning: '#93500A',
  warningSoft: '#FDF0DC',
  info: '#2B5C8A',
  infoSoft: '#E3EEF8',
  chart: { primary: '#15834F', water: '#2563A8', accent: '#B7791F', grid: '#E3EAE4' },
};

export const dark: Palette = {
  bg: '#0D1410',
  surface: '#16201A',
  surfaceAlt: '#1E2A23',
  text: '#E7EFE9',
  textSecondary: '#B4C2B8',
  muted: '#8B9A90',
  border: '#2B3A31',
  primary: '#5CC08B',
  primaryText: '#0D1410',
  primarySoft: '#1C3828',
  water: '#7AB2F0',
  waterSoft: '#1A2C42',
  accent: '#E3AE5A',
  danger: '#F2877D',
  dangerSoft: '#3A1E1B',
  warning: '#F0B565',
  warningSoft: '#3A2A14',
  info: '#8DB9E6',
  infoSoft: '#1A2A3A',
  chart: { primary: '#3DAA74', water: '#4F8FDB', accent: '#B98128', grid: '#26332B' },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
export const font = {
  h1: 26,
  h2: 20,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
};

export const ThemeContext = createContext<{ colors: Palette; scheme: 'light' | 'dark' }>({ colors: light, scheme: 'light' });

export function useTheme() {
  return useContext(ThemeContext);
}
