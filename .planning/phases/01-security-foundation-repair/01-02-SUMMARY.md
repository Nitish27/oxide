---
phase: 01-security-foundation-repair
plan: 02
subsystem: backend-architecture
tags: [refactoring, driver-registry, database-abstraction, rust]
dependency-graph:
  requires: [01-01]
  provides: [DriverRegistry, DriverConnection, DatabaseDriver-pattern]
  affects: [lib.rs, query_engine.rs, csv_importer.rs, sql_importer.rs, exporter.rs]
tech-stack:
  added: []
  patterns: [enum-dispatch, driver-registry, pool-per-driver]
key-files:
  created:
    - src-tauri/src/drivers/mod.rs
    - src-tauri/src/drivers/postgres.rs
    - src-tauri/src/drivers/mysql.rs
    - src-tauri/src/drivers/sqlite.rs
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/src/core/mod.rs
    - src-tauri/src/core/query_engine.rs
    - src-tauri/src/core/connection_manager.rs
    - src-tauri/src/importer/csv_importer.rs
    - src-tauri/src/importer/sql_importer.rs
    - src-tauri/src/exporter/exporter.rs
decisions:
  - Manual match dispatch over enum_dispatch crate for Phase 1 simplicity
  - SSH tunnel logic kept in connection_manager.rs as static method, reused by DriverRegistry
  - Pool cloning pattern for exporter/importer to avoid holding mutex across async streams
  - ConnectionManager module retained for SshTunnel struct and establish_ssh_tunnel_static
metrics:
  duration: 4min
  completed: 2026-03-02
---

# Phase 01 Plan 02: DriverRegistry Refactor Summary

DriverRegistry with DriverConnection enum dispatch replaces triple-HashMap ConnectionManager for all database operations

## What Changed

### Task 1: Created drivers module (97064bc)
- **drivers/mod.rs**: DriverRegistry struct with `connections: HashMap<Uuid, DriverConnection>`, configs, passwords, tunnels. Methods: `connect()`, `test_connection()`, `disconnect()`, `switch_database()`, `get_connections()`, `get_config()`, `get_db_type_str()`. DriverConnection enum with Postgres/MySQL/SQLite variants. DriverType enum for identification.
- **drivers/postgres.rs**: PostgresDriver with PgPool, connect with SSL/options builder pattern, test_connection static method.
- **drivers/mysql.rs**: MySQLDriver with MySqlPool, connect with SSL support, test_connection static method.
- **drivers/sqlite.rs**: SQLiteDriver with SqlitePool, connect via URL, test_connection static method.
- **connection_manager.rs**: `establish_ssh_tunnel` promoted to `establish_ssh_tunnel_static` (pub, no &self) for DriverRegistry reuse.

### Task 2: Migrated all Tauri commands (1d7bf71)
- **core/mod.rs**: AppState.connection_manager replaced with AppState.driver_registry (Arc<DriverRegistry>).
- **lib.rs**: All 17 Tauri commands rewritten. `connect/test_connection/disconnect/switch_database` dispatch to DriverRegistry directly. Query/metadata/sidebar commands dispatch through QueryEngine which takes &DriverRegistry.
- **query_engine.rs**: All methods take `&DriverRegistry` instead of `&ConnectionManager`. Each method acquires the connections lock, matches on DriverConnection variant, and calls the appropriate pool-specific sqlx operations.
- **importer/csv_importer.rs**: `state.connection_manager` replaced with `state.driver_registry`. Pool extracted via DriverConnection match into InsertTarget enum.
- **importer/sql_importer.rs**: Same pattern as csv_importer.
- **exporter/exporter.rs**: Pools cloned out of the lock before streaming to avoid holding the mutex across await points.

## Architecture

```
AppState
  |-- driver_registry: Arc<DriverRegistry>
        |-- connections: HashMap<Uuid, DriverConnection>
        |     |-- DriverConnection::Postgres(PostgresDriver { pool, id })
        |     |-- DriverConnection::MySQL(MySQLDriver { pool, id })
        |     |-- DriverConnection::SQLite(SQLiteDriver { pool, id })
        |-- configs: HashMap<Uuid, ConnectionConfig>
        |-- passwords: HashMap<Uuid, Option<String>>
        |-- tunnels: HashMap<Uuid, Arc<SshTunnel>>
```

Adding a new database engine (Phase 9) requires:
1. New driver file (e.g., `drivers/oracle.rs`) with struct + connect/test methods
2. New DriverConnection variant
3. New match arms in QueryEngine methods

No changes to Tauri command signatures or frontend invoke() calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Importer/exporter ConnectionManager references**
- **Found during:** Task 2
- **Issue:** Plan only listed lib.rs, core/mod.rs, query_engine.rs, connection_manager.rs for Task 2, but csv_importer.rs, sql_importer.rs, and exporter.rs also had direct ConnectionManager references that would cause compilation failure.
- **Fix:** Updated all 3 importer/exporter files to use DriverRegistry with pool-cloning pattern.
- **Files modified:** csv_importer.rs, sql_importer.rs, exporter.rs

**2. [Rule 1 - Bug] Unreachable code warning in streaming query**
- **Found during:** Task 2 verification
- **Issue:** `Err(anyhow!("Connection not found"))` after exhaustive match was unreachable.
- **Fix:** Removed the unreachable fallthrough error.
- **Commit:** Included in 1d7bf71

## Decisions Made

1. **Manual match dispatch**: Chose manual `match conn { Postgres(d) => ..., MySQL(d) => ..., SQLite(d) => ... }` over `enum_dispatch` crate. This avoids async_trait + enum_dispatch compatibility issues and keeps dependencies minimal. With only 3 variants in Phase 1 this is not a performance concern.

2. **SSH tunnel as static method**: Rather than duplicating SSH tunnel logic in DriverRegistry, exposed `ConnectionManager::establish_ssh_tunnel_static` as a public static method. The ConnectionManager module is retained solely for the SshTunnel struct and this function.

3. **Pool cloning for streaming**: The exporter clones pools out of the DriverRegistry lock before starting streaming operations. This avoids holding the Mutex across await points which would deadlock.

## Self-Check: PASSED

- [x] src-tauri/src/drivers/mod.rs exists
- [x] src-tauri/src/drivers/postgres.rs exists
- [x] src-tauri/src/drivers/mysql.rs exists
- [x] src-tauri/src/drivers/sqlite.rs exists
- [x] Commit 97064bc found (Task 1)
- [x] Commit 1d7bf71 found (Task 2)
- [x] 0 ConnectionManager references in lib.rs
- [x] 21 driver_registry references in lib.rs
- [x] cargo check passes with 0 warnings
