// Shared types for domain stores.
// Stores import types from this file, NOT from each other, to prevent circular imports.

export type TabType = 'table' | 'query' | 'structure';

export interface FilterConfig {
  id: string;
  column: string;
  operator: string;
  value: string;
  enabled: boolean;
}

export interface SortConfig {
  column: string | null;
  direction: 'ASC' | 'DESC';
}

export interface TableColumnStructure {
  name: string;
  data_type: string;
  is_nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
  comment: string | null;
}

export type SidebarItemType = 'Table' | 'View' | 'Function' | 'Procedure';

export interface SidebarItem {
  name: string;
  item_type: SidebarItemType;
  schema?: string;
}

export interface SidebarSettings {
  showFunctions: boolean;
  showRecent: boolean;
  showSystem: boolean;
}

export interface TableIndexStructure {
  name: string;
  columns: string[];
  is_unique: boolean;
  index_type: string;
}

export interface TableConstraintStructure {
  name: string;
  constraint_type: string;
  definition: string;
}

export interface TableStructure {
  columns: TableColumnStructure[];
  indexes: TableIndexStructure[];
  constraints: TableConstraintStructure[];
}

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  tableName?: string;
  connectionId: string;
  database?: string;
  query?: string;
  selectedRowIndex?: number | null;
  columns?: string[];
  // NOTE: rows intentionally excluded from Zustand store.
  // Row data should be kept in component-local refs (useRef) or a Map outside Zustand.
  rows?: any[][];
  pageSize?: number;
  offset?: number;
  totalRows?: number;
  filters?: FilterConfig[];
  isFilterVisible?: boolean;
  sortConfig?: SortConfig;
  hiddenColumns?: string[];
  isColumnsPopoverVisible?: boolean;
  viewMode?: 'data' | 'structure' | 'message';
  tableStructure?: TableStructure;
  messages?: string[];
  elapsedTime?: number;
  stats?: {
    time: number;
    rows: number;
    totalRows?: number;
  } | null;
}

export interface HistoryItem {
  id: string;
  sql: string;
  timestamp: number;
  connectionId: string;
  database?: string;
  executionTimeMs?: number;
  rowsAffected?: number;
}

export interface SavedConnection {
  id: string;
  name: string;
  type: 'Postgres' | 'MySql' | 'Sqlite';
  host?: string;
  port?: number;
  username?: string;
  database?: string;
  ssl_enabled?: boolean;
  ssl_mode?: string;
  ssl_ca_path?: string;
  ssl_cert_path?: string;
  ssl_key_path?: string;
  ssh_enabled?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: 'password' | 'key';
  ssh_password?: string;
  ssh_private_key_path?: string;
  environment?: 'local' | 'test' | 'dev' | 'staging' | 'production';
  color: string;
}
