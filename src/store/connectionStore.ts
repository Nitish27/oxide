// PERSISTENCE: All persistent data uses StoreService (tauri-plugin-store).
// DO NOT use localStorage -- it will be wiped on Tauri URL scheme changes.

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { storeService } from '../services/StoreService';
import type { SavedConnection } from './types';

interface ConnectionState {
  savedConnections: SavedConnection[];
  openConnectionIds: string[];
  activeConnectionId: string | null;
  selectedConnectionId: string | null;
  activeDatabase: string | null;
  activeTable: string | null;
  activeSchema: string | null;
  activeDatabases: Record<string, string | null>;
  activeTables: Record<string, string | null>;
  databases: string[];
  showDbName: boolean;
  showConnectionName: boolean;

  // Actions
  loadConnections: () => Promise<void>;
  addConnection: (conn: SavedConnection) => void;
  updateConnection: (id: string, updates: Partial<SavedConnection>) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
  selectConnection: (id: string) => void;
  closeConnectionFromRail: (id: string) => void;
  setActiveDatabase: (db: string | null) => Promise<void>;
  setDatabases: (dbs: string[]) => void;
  setActiveSchema: (schema: string | null) => void;
  setActiveTable: (table: string | null) => void;
  setShowDbName: (show: boolean) => void;
  setShowConnectionName: (show: boolean) => void;
  connect: (connection: SavedConnection, password?: string | null) => Promise<void>;
}

// Async helper to persist connections via StoreService
const saveConnectionsToStore = async (connections: SavedConnection[]) => {
  await storeService.setConnections(connections);
};

// Async helper to load connections via StoreService
const loadConnectionsFromStore = async (): Promise<SavedConnection[]> => {
  try {
    return await storeService.getConnections();
  } catch (e) {
    console.error('Failed to load connections:', e);
    return [];
  }
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  savedConnections: [],
  openConnectionIds: [],
  activeConnectionId: null,
  selectedConnectionId: null,
  activeDatabase: null,
  activeTable: null,
  activeSchema: null,
  activeDatabases: {},
  activeTables: {},
  databases: [],
  showDbName: true,
  showConnectionName: true,

  loadConnections: async () => {
    const connections = await loadConnectionsFromStore();
    set({ savedConnections: connections });
  },

  addConnection: (conn) => {
    const newConnections = [...get().savedConnections, conn];
    saveConnectionsToStore(newConnections).catch((e) =>
      console.error('Failed to save connections:', e)
    );
    set({ savedConnections: newConnections });
  },

  updateConnection: (id, updates) => {
    const newConnections = get().savedConnections.map(c =>
      c.id === id ? { ...c, ...updates } : c
    );
    saveConnectionsToStore(newConnections).catch((e) =>
      console.error('Failed to save connections:', e)
    );
    set({ savedConnections: newConnections });
  },

  removeConnection: (id) => {
    const newConnections = get().savedConnections.filter(c => c.id !== id);
    saveConnectionsToStore(newConnections).catch((e) =>
      console.error('Failed to save connections:', e)
    );
    set({ savedConnections: newConnections });
  },

  setActiveConnection: (id) => set((state) => {
    const conn = state.savedConnections.find(c => c.id === id);
    const openIds = id ? (state.openConnectionIds.includes(id) ? state.openConnectionIds : [...state.openConnectionIds, id]) : state.openConnectionIds;

    const restoredDb = id ? state.activeDatabases[id] || conn?.database || null : null;
    const restoredTable = id ? state.activeTables[id] || null : null;

    if (id) {
      if (restoredDb) {
        invoke('switch_database', { connectionId: id, dbName: restoredDb }).catch(() => {});
      }
    }

    return {
      activeConnectionId: id,
      selectedConnectionId: id,
      openConnectionIds: openIds,
      activeDatabase: restoredDb,
      activeTable: restoredTable,
      databases: [],
    };
  }),

  connect: async (conn, password) => {
    try {
      const config = {
        id: conn.id,
        name: conn.name,
        db_type: conn.type,
        host: conn.host || null,
        port: conn.port || null,
        username: conn.username || null,
        database: conn.database || null,
        ssl_enabled: conn.ssl_enabled || false,
        ssl_mode: conn.ssl_mode || 'prefer',
        ssl_ca_path: conn.ssl_ca_path || null,
        ssl_cert_path: conn.ssl_cert_path || null,
        ssl_key_path: conn.ssl_key_path || null,
        ssh_enabled: conn.ssh_enabled || false,
        ssh_host: conn.ssh_host || null,
        ssh_port: conn.ssh_port || null,
        ssh_username: conn.ssh_username || null,
        ssh_auth_method: conn.ssh_auth_method || 'password',
        ssh_password: null,
        ssh_private_key_path: conn.ssh_private_key_path || null,
        environment: conn.environment || 'local',
        color_tag: conn.color || 'blue',
      };
      await invoke('connect', { config, password });
    } catch (err) {
      console.error('Connection failed:', err);
      throw err;
    }
  },

  selectConnection: (id) => {
    set((state) => {
      const conn = state.savedConnections.find(c => c.id === id);
      const restoredDb = state.activeDatabases[id] || conn?.database || null;
      const restoredTable = state.activeTables[id] || null;

      if (restoredDb) {
        invoke('switch_database', { connectionId: id, dbName: restoredDb }).catch(() => {});
      }

      const newOpenIds = state.openConnectionIds.includes(id)
        ? state.openConnectionIds
        : [...state.openConnectionIds, id];

      return {
        selectedConnectionId: id,
        activeConnectionId: id,
        activeDatabase: restoredDb,
        activeTable: restoredTable,
        openConnectionIds: newOpenIds,
      };
    });
  },

  closeConnectionFromRail: (id) => set((state) => {
    const newOpenIds = state.openConnectionIds.filter(oid => oid !== id);
    let newSelectedId = state.selectedConnectionId;

    if (newSelectedId === id) {
      newSelectedId = newOpenIds.length > 0 ? newOpenIds[newOpenIds.length - 1] : null;
    }

    const conn = state.savedConnections.find(c => c.id === newSelectedId);
    const restoredDb = newSelectedId ? state.activeDatabases[newSelectedId] || conn?.database || null : null;
    const restoredTable = newSelectedId ? state.activeTables[newSelectedId] || null : null;

    if (newSelectedId && restoredDb) {
      invoke('switch_database', { connectionId: newSelectedId, dbName: restoredDb }).catch(() => {});
    }

    return {
      openConnectionIds: newOpenIds,
      selectedConnectionId: newSelectedId,
      activeConnectionId: newSelectedId,
      activeDatabase: restoredDb,
      activeTable: restoredTable,
      databases: [],
    };
  }),

  setActiveDatabase: async (db) => {
    const { activeConnectionId } = get();
    if (activeConnectionId && db) {
      try {
        await invoke('switch_database', { connectionId: activeConnectionId, dbName: db });
      } catch (err) {
        console.error('Failed to switch database:', err);
      }
    }

    set((state) => {
      const activeConnId = state.activeConnectionId;
      const newActiveDatabases = activeConnId ? { ...state.activeDatabases, [activeConnId]: db } : state.activeDatabases;
      const newActiveTables = activeConnId ? { ...state.activeTables, [activeConnId]: null } : state.activeTables;

      return {
        activeDatabase: db,
        activeTable: null,
        activeDatabases: newActiveDatabases,
        activeTables: newActiveTables,
      };
    });
  },

  setDatabases: (dbs) => set({ databases: dbs }),
  setActiveSchema: (schema) => set({ activeSchema: schema }),
  setActiveTable: (table) => set((state) => {
    const activeConnId = state.activeConnectionId;
    const newActiveTables = activeConnId ? { ...state.activeTables, [activeConnId]: table } : state.activeTables;
    return {
      activeTable: table,
      activeTables: newActiveTables,
    };
  }),
  setShowDbName: (show) => set({ showDbName: show }),
  setShowConnectionName: (show) => set({ showConnectionName: show }),
}));
