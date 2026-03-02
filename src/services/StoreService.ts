// PERSISTENCE: All persistent data uses StoreService (tauri-plugin-store).
// DO NOT use localStorage -- it will be wiped on Tauri URL scheme changes.
// See: .planning/phases/01-security-foundation-repair/01-RESEARCH.md

import { load, Store } from '@tauri-apps/plugin-store';

const LEGACY_KEYS = {
  connections: ['sqlmate_saved_connections', 'oxide_saved_connections'],
  history: ['sqlmate_query_history', 'oxide_query_history'],
};

export class StoreService {
  private connectionsStore: Store | null = null;
  private historyStore: Store | null = null;
  private settingsStore: Store | null = null;

  async init(): Promise<void> {
    this.connectionsStore = await load('connections.json', { autoSave: true });
    this.historyStore = await load('history.json', { autoSave: true });
    this.settingsStore = await load('settings.json', { autoSave: true });
    await this.migrateFromLocalStorage();
  }

  private async migrateFromLocalStorage(): Promise<void> {
    const alreadyMigrated = await this.connectionsStore!.get<boolean>('_migrated_v1');
    if (alreadyMigrated) return;

    // Set migration flag FIRST to prevent re-migration on failure
    await this.connectionsStore!.set('_migrated_v1', true);

    // Migrate connections
    for (const key of LEGACY_KEYS.connections) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const connections = JSON.parse(raw);
          // Strip ssh_password from each connection -- do NOT persist it
          const cleaned = connections.map((conn: any) => {
            const { ssh_password, ...rest } = conn;
            // If ssh_password existed, log a warning. In a future enhancement,
            // this should be written to keyring via a Tauri command.
            if (ssh_password) {
              console.warn(`Migration: stripped ssh_password from connection "${conn.name}". Please re-enter it on next SSH connection.`);
            }
            return rest;
          });
          const existing = await this.connectionsStore!.get<any[]>('connections') ?? [];
          await this.connectionsStore!.set('connections', [...existing, ...cleaned]);
          localStorage.removeItem(key);
        } catch (e) {
          console.error(`Migration: failed to parse connections from ${key}`, e);
        }
      }
    }

    // Migrate query history
    for (const key of LEGACY_KEYS.history) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const history = JSON.parse(raw);
          const existing = await this.historyStore!.get<any[]>('items') ?? [];
          await this.historyStore!.set('items', [...existing, ...history]);
          localStorage.removeItem(key);
        } catch (e) {
          console.error(`Migration: failed to parse history from ${key}`, e);
        }
      }
    }
  }

  // Connection methods
  async getConnections(): Promise<any[]> {
    return (await this.connectionsStore!.get<any[]>('connections')) ?? [];
  }

  async setConnections(connections: any[]): Promise<void> {
    await this.connectionsStore!.set('connections', connections);
  }

  // History methods
  async getHistory(): Promise<any[]> {
    return (await this.historyStore!.get<any[]>('items')) ?? [];
  }

  async setHistory(items: any[]): Promise<void> {
    await this.historyStore!.set('items', items);
  }

  // Settings methods (for Phase 2+ use)
  async getSetting<T>(key: string): Promise<T | null> {
    return await this.settingsStore!.get<T>(key);
  }

  async setSetting(key: string, value: any): Promise<void> {
    await this.settingsStore!.set(key, value);
  }
}

export const storeService = new StoreService();
