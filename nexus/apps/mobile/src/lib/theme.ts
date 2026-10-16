import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  userBubble: string;
  danger: string;
  success: string;
  warning: string;
  codeBg: string;
  overlay: string;
  chart: string[];
}

const light: Palette = {
  bg: '#F5F1EA',
  surface: '#FAF8F4',
  surfaceAlt: '#EFEAE1',
  card: '#FFFFFF',
  text: '#2B2622',
  textMuted: '#6E655D',
  textFaint: '#A39A90',
  border: '#E3DCD1',
  accent: '#C96442',
  accentText: '#FFFFFF',
  accentSoft: '#F3DED4',
  userBubble: '#EDE7DC',
  danger: '#B3412E',
  success: '#3B8A5A',
  warning: '#B7791F',
  codeBg: '#F0EBE3',
  overlay: 'rgba(30,25,20,0.35)',
  chart: ['#C96442', '#4F7CAC', '#3B8A5A', '#B7791F', '#8E5BA8', '#2A9D9A', '#A0522D', '#6B7A8F'],
};

const dark: Palette = {
  bg: '#262624',
  surface: '#2E2D2A',
  surfaceAlt: '#363431',
  card: '#30302D',
  text: '#ECE6DD',
  textMuted: '#ADA59B',
  textFaint: '#7D766D',
  border: '#3F3C37',
  accent: '#D97757',
  accentText: '#1F1D1A',
  accentSoft: '#4A3329',
  userBubble: '#3A3834',
  danger: '#E07A66',
  success: '#6FBF8E',
  warning: '#E0B15C',
  codeBg: '#1F1E1C',
  overlay: 'rgba(0,0,0,0.5)',
  chart: ['#D97757', '#7AA6D6', '#6FBF8E', '#E0B15C', '#B98CD3', '#5CC7C4', '#D08A5E', '#9AA8BC'],
};

export function useTheme(): { c: Palette; dark: boolean; serif: boolean } {
  const system = useColorScheme();
  const mode = useSettings((s) => s.themeMode);
  const serif = useSettings((s) => s.serifFont);
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  return { c: isDark ? dark : light, dark: isDark, serif };
}

export const radius = { sm: 8, md: 12, lg: 18, xl: 24 };
export const space = (n: number) => n * 4;
