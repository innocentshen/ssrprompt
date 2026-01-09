import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ocrApi } from '../api/ocr';
import type { OcrProviderSettings, UpdateOcrProviderSettingsDto } from '../types';

interface OcrSettingsState {
  settings: OcrProviderSettings | null;
  isLoading: boolean;
  lastFetched: number | null;
  fetchSettings: (force?: boolean) => Promise<void>;
  saveSettings: (data: UpdateOcrProviderSettingsDto) => Promise<OcrProviderSettings>;
  clear: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000;

export const useOcrSettingsStore = create<OcrSettingsState>()(
  devtools(
    (set, get) => ({
      settings: null,
      isLoading: false,
      lastFetched: null,

      fetchSettings: async (force = false) => {
        const { lastFetched, isLoading } = get();
        const now = Date.now();
        if (isLoading) return;
        if (!force && lastFetched && now - lastFetched < CACHE_DURATION) return;

        set({ isLoading: true });
        try {
          const settings = await ocrApi.getSettings();
          set({ settings, lastFetched: Date.now() });
        } finally {
          set({ isLoading: false });
        }
      },

      saveSettings: async (data) => {
        const settings = await ocrApi.updateSettings(data);
        set({ settings, lastFetched: Date.now() });
        return settings;
      },

      clear: () => set({ settings: null, lastFetched: null, isLoading: false }),
    }),
    { name: 'ocr-settings-store' }
  )
);

