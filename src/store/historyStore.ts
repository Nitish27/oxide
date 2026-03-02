// History store: query history ring buffer with StoreService persistence.
// Capped at 500 items.

import { create } from 'zustand';
import { storeService } from '../services/StoreService';
import type { HistoryItem } from './types';

const HISTORY_MAX = 500;

interface HistoryState {
  queryHistory: HistoryItem[];

  // Actions
  loadHistory: () => Promise<void>;
  addToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
}

const loadHistoryFromStore = async (): Promise<HistoryItem[]> => {
  try {
    return await storeService.getHistory();
  } catch (e) {
    console.error('Failed to load history:', e);
    return [];
  }
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  queryHistory: [],

  loadHistory: async () => {
    const history = await loadHistoryFromStore();
    set({ queryHistory: history });
  },

  addToHistory: (item) => {
    const newItem: HistoryItem = {
      ...item,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
    };
    const newHistory = [newItem, ...get().queryHistory].slice(0, HISTORY_MAX);
    storeService.setHistory(newHistory).catch((e) =>
      console.error('Failed to save history:', e)
    );
    set({ queryHistory: newHistory });
  },
}));
