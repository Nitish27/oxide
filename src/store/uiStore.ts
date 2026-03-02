// UI store: modal visibility, panel toggles (ephemeral, no persistence).

import { create } from 'zustand';

interface UIState {
  showConnectionModal: boolean;
  showDatabaseSelector: boolean;
  showImportDialog: boolean;
  showExportDialog: boolean;
  showConnectionSelector: boolean;
  prefilledConfig: any | null;
  connectionModalMode: 'manual' | 'url';
  sidebarViewMode: 'items' | 'queries' | 'history';
  activePanels: {
    sidebar: boolean;
    right: boolean;
    console: boolean;
  };
  refreshTrigger: number;

  // Actions
  setShowConnectionModal: (show: boolean) => void;
  setShowDatabaseSelector: (show: boolean) => void;
  setShowImportDialog: (show: boolean) => void;
  setShowExportDialog: (show: boolean) => void;
  setShowConnectionSelector: (show: boolean) => void;
  setPrefilledConfig: (config: any | null) => void;
  setConnectionModalMode: (mode: 'manual' | 'url') => void;
  setSidebarViewMode: (mode: 'items' | 'queries' | 'history') => void;
  togglePanel: (panel: 'sidebar' | 'right' | 'console') => void;
  triggerRefresh: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  showConnectionModal: false,
  showDatabaseSelector: false,
  showImportDialog: false,
  showExportDialog: false,
  showConnectionSelector: false,
  prefilledConfig: null,
  connectionModalMode: 'manual',
  sidebarViewMode: 'items',
  activePanels: {
    sidebar: true,
    right: false,
    console: false,
  },
  refreshTrigger: 0,

  setShowConnectionModal: (show) => set({ showConnectionModal: show }),
  setShowDatabaseSelector: (show) => set({ showDatabaseSelector: show }),
  setShowImportDialog: (show) => set({ showImportDialog: show }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowConnectionSelector: (show) => set({ showConnectionSelector: show }),
  setPrefilledConfig: (config) => set({ prefilledConfig: config }),
  setConnectionModalMode: (mode) => set({ connectionModalMode: mode }),
  setSidebarViewMode: (mode) => set({ sidebarViewMode: mode }),
  togglePanel: (panel) => set((state) => ({
    activePanels: {
      ...state.activePanels,
      [panel]: !state.activePanels[panel],
    },
  })),
  triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));
