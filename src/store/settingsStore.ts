// Settings store: theme, safeMode, UI preferences with StoreService persistence.
// Mostly placeholder defaults in Phase 1 -- grows in Phase 2 when preferences UI is built.

import { create } from 'zustand';
import { storeService } from '../services/StoreService';

interface SettingsState {
  theme: 'dark' | 'light';
  safeMode: 'Silent' | 'Alert' | 'Safe';

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  setSafeMode: (mode: 'Silent' | 'Alert' | 'Safe') => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  safeMode: 'Silent',

  setTheme: (theme) => {
    set({ theme });
    storeService.setSetting('theme', theme).catch((e) =>
      console.error('Failed to save theme setting:', e)
    );
  },

  setSafeMode: (mode) => {
    set({ safeMode: mode });
    storeService.setSetting('safeMode', mode).catch((e) =>
      console.error('Failed to save safeMode setting:', e)
    );
  },

  loadSettings: async () => {
    try {
      const theme = await storeService.getSetting<'dark' | 'light'>('theme');
      const safeMode = await storeService.getSetting<'Silent' | 'Alert' | 'Safe'>('safeMode');
      set({
        ...(theme ? { theme } : {}),
        ...(safeMode ? { safeMode } : {}),
      });
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  },
}));
