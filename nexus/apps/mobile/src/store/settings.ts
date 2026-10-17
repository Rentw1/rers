import { create } from 'zustand';
import { DEFAULT_MODEL_ID, DEFAULT_PROVIDER_ID } from '@nexus/core';
import { allSettings, setSetting } from '@/lib/repo';

export interface SettingsState {
  loaded: boolean;
  onboarded: boolean;
  themeMode: 'system' | 'light' | 'dark';
  language: 'ru' | 'en';
  currency: 'USD' | 'RUB' | 'EUR';
  serifFont: boolean;
  defaultProviderId: string;
  defaultModelId: string;
  customInstructions: string;
  biometricLock: boolean;
  autoUpdateCheck: boolean;
  haptics: boolean;
  showCost: boolean;
  showReasoning: boolean;
  autoTitle: boolean;
  phoneToolsEnabled: boolean;
  temperature: number | null;
  maxOutputTokens: number | null;
  fx: { RUB: number; EUR: number; updatedAt: number } | null;
  pricesSyncedAt: number;
  updateCheckedAt: number;
  notifAsked: boolean;
  ttsRate: number;
  load: () => Promise<void>;
  set: <K extends keyof Persisted>(key: K, value: Persisted[K]) => Promise<void>;
}

type Persisted = Omit<SettingsState, 'loaded' | 'load' | 'set'>;

const DEFAULTS: Persisted = {
  onboarded: false,
  themeMode: 'system',
  language: 'ru',
  currency: 'USD',
  serifFont: true,
  defaultProviderId: DEFAULT_PROVIDER_ID,
  defaultModelId: DEFAULT_MODEL_ID,
  customInstructions: '',
  biometricLock: false,
  autoUpdateCheck: true,
  haptics: true,
  showCost: true,
  showReasoning: true,
  autoTitle: true,
  phoneToolsEnabled: true,
  temperature: null,
  maxOutputTokens: null,
  fx: null,
  pricesSyncedAt: 0,
  updateCheckedAt: 0,
  notifAsked: false,
  ttsRate: 1,
};

export const useSettings = create<SettingsState>((set) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    const stored = await allSettings();
    const patch: Partial<Persisted> = {};
    for (const k of Object.keys(DEFAULTS) as (keyof Persisted)[]) {
      if (k in stored) (patch as Record<string, unknown>)[k] = stored[k];
    }
    set({ ...patch, loaded: true });
  },
  set: async (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    await setSetting(key, value);
  },
}));

export const settings = () => useSettings.getState();
