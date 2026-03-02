pub mod postgres;
pub mod mysql;
pub mod sqlite;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use anyhow::{Result, anyhow};

use crate::core::{ConnectionConfig, DatabaseType};
use crate::core::connection_manager::SshTunnel;

pub use self::postgres::PostgresDriver;
pub use self::mysql::MySQLDriver;
pub use self::sqlite::SQLiteDriver;

/// Identifies which database engine a driver targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriverType {
    Postgres,
    MySQL,
    SQLite,
}

/// Enum-based dispatch: holds one concrete driver per connection.
/// Adding a new engine requires only one new variant here + one new module.
pub enum DriverConnection {
    Postgres(PostgresDriver),
    MySQL(MySQLDriver),
    SQLite(SQLiteDriver),
}

impl DriverConnection {
    pub fn driver_type(&self) -> DriverType {
        match self {
            DriverConnection::Postgres(_) => DriverType::Postgres,
            DriverConnection::MySQL(_) => DriverType::MySQL,
            DriverConnection::SQLite(_) => DriverType::SQLite,
        }
    }

    pub fn connection_id(&self) -> Uuid {
        match self {
            DriverConnection::Postgres(d) => d.id,
            DriverConnection::MySQL(d) => d.id,
            DriverConnection::SQLite(d) => d.id,
        }
    }

    /// Get a reference to the Postgres pool, if this is a Postgres connection.
    pub fn as_postgres_pool(&self) -> Option<&sqlx::PgPool> {
        match self {
            DriverConnection::Postgres(d) => d.pool.as_ref(),
            _ => None,
        }
    }

    /// Get a reference to the MySQL pool, if this is a MySQL connection.
    pub fn as_mysql_pool(&self) -> Option<&sqlx::MySqlPool> {
        match self {
            DriverConnection::MySQL(d) => d.pool.as_ref(),
            _ => None,
        }
    }

    /// Get a reference to the SQLite pool, if this is a SQLite connection.
    pub fn as_sqlite_pool(&self) -> Option<&sqlx::SqlitePool> {
        match self {
            DriverConnection::SQLite(d) => d.pool.as_ref(),
            _ => None,
        }
    }
}

/// Central registry that manages all active database connections.
/// Replaces the old triple-HashMap ConnectionManager.
pub struct DriverRegistry {
    connections: Arc<Mutex<HashMap<Uuid, DriverConnection>>>,
    configs: Arc<Mutex<HashMap<Uuid, ConnectionConfig>>>,
    passwords: Arc<Mutex<HashMap<Uuid, Option<String>>>>,
    tunnels: Arc<Mutex<HashMap<Uuid, Arc<SshTunnel>>>>,
}

impl DriverRegistry {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            configs: Arc::new(Mutex::new(HashMap::new())),
            passwords: Arc::new(Mutex::new(HashMap::new())),
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Connect to a database, creating the appropriate driver based on db_type.
    pub async fn connect(&self, config: ConnectionConfig, password: Option<String>) -> Result<()> {
        let id = config.id;

        // Store config and password
        {
            let mut configs = self.configs.lock().await;
            configs.insert(id, config.clone());
        }
        {
            let mut passwords = self.passwords.lock().await;
            passwords.insert(id, password.clone());
        }

        let mut final_config = config.clone();

        // Handle SSH tunneling (overlay -- not driver-specific)
        if config.ssh_enabled {
            let tunnel = crate::core::connection_manager::ConnectionManager::establish_ssh_tunnel_static(&config).await?;
            final_config.host = Some("127.0.0.1".to_string());
            final_config.port = Some(tunnel.local_port);
            let mut tunnels = self.tunnels.lock().await;
            tunnels.insert(id, tunnel);
        }

        let driver_conn = match config.db_type {
            DatabaseType::Postgres => {
                let mut driver = PostgresDriver::new(id);
                driver.connect(&final_config, password.as_deref()).await?;
                DriverConnection::Postgres(driver)
            }
            DatabaseType::MySql => {
                let mut driver = MySQLDriver::new(id);
                driver.connect(&final_config, password.as_deref()).await?;
                DriverConnection::MySQL(driver)
            }
            DatabaseType::Sqlite => {
                let mut driver = SQLiteDriver::new(id);
                driver.connect(&final_config, password.as_deref()).await?;
                DriverConnection::SQLite(driver)
            }
        };

        let mut connections = self.connections.lock().await;
        connections.insert(id, driver_conn);

        Ok(())
    }

    /// Test a database connection without persisting it.
    pub async fn test_connection(&self, config: ConnectionConfig, password: Option<String>) -> Result<()> {
        let mut final_config = config.clone();
        let mut tunnel_opt: Option<Arc<SshTunnel>> = None;

        if config.ssh_enabled {
            let tunnel = crate::core::connection_manager::ConnectionManager::establish_ssh_tunnel_static(&config).await?;
            final_config.host = Some("127.0.0.1".to_string());
            final_config.port = Some(tunnel.local_port);
            tunnel_opt = Some(tunnel);
        }

        let result = match final_config.db_type {
            DatabaseType::Postgres => PostgresDriver::test_connection(&final_config, password.as_deref()).await,
            DatabaseType::MySql => MySQLDriver::test_connection(&final_config, password.as_deref()).await,
            DatabaseType::Sqlite => SQLiteDriver::test_connection(&final_config).await,
        };

        // Clean up temporary test tunnel
        if let Some(tunnel) = tunnel_opt {
            tunnel.task_handle.abort();
        }

        result
    }

    /// Disconnect and remove a connection by ID.
    pub async fn disconnect(&self, id: &Uuid) -> Result<()> {
        {
            let mut configs = self.configs.lock().await;
            configs.remove(id);
        }
        {
            let mut passwords = self.passwords.lock().await;
            passwords.remove(id);
        }
        {
            let mut connections = self.connections.lock().await;
            connections.remove(id);
            // Pool is dropped automatically when DriverConnection is dropped
        }
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(tunnel) = tunnels.remove(id) {
                tunnel.task_handle.abort();
            }
        }
        Ok(())
    }

    /// Switch to a different database on an existing connection.
    pub async fn switch_database(&self, id: &Uuid, db_name: &str) -> Result<()> {
        let config = {
            let configs = self.configs.lock().await;
            configs.get(id).cloned().ok_or_else(|| anyhow!("Connection config not found"))?
        };
        let password = {
            let passwords = self.passwords.lock().await;
            passwords.get(id).cloned().flatten()
        };

        let mut new_config = config.clone();
        new_config.database = Some(db_name.to_string());

        match new_config.db_type {
            DatabaseType::Sqlite => {
                return Err(anyhow!("SQLite does not support switching databases within the same file connection."));
            }
            _ => {}
        }

        // Reconnect with new database name
        // We keep the same tunnel if SSH is active
        let mut final_config = new_config.clone();
        {
            let tunnels = self.tunnels.lock().await;
            if let Some(tunnel) = tunnels.get(id) {
                final_config.host = Some("127.0.0.1".to_string());
                final_config.port = Some(tunnel.local_port);
            }
        }

        let driver_conn = match new_config.db_type {
            DatabaseType::Postgres => {
                let mut driver = PostgresDriver::new(*id);
                driver.connect(&final_config, password.as_deref()).await?;
                DriverConnection::Postgres(driver)
            }
            DatabaseType::MySql => {
                let mut driver = MySQLDriver::new(*id);
                driver.connect(&final_config, password.as_deref()).await?;
                DriverConnection::MySQL(driver)
            }
            DatabaseType::Sqlite => unreachable!(),
        };

        // Update stored state
        {
            let mut connections = self.connections.lock().await;
            connections.insert(*id, driver_conn);
        }
        {
            let mut configs = self.configs.lock().await;
            configs.insert(*id, new_config);
        }
        {
            let mut passwords = self.passwords.lock().await;
            passwords.insert(*id, password);
        }

        Ok(())
    }

    /// Execute a closure with a reference to the locked connections map.
    /// This is the primary dispatch pattern: callers get the lock, find their
    /// connection, and call methods on the DriverConnection.
    pub async fn with_connection<F, R>(&self, id: &Uuid, f: F) -> Result<R>
    where
        F: FnOnce(&DriverConnection) -> Result<R>,
    {
        let connections = self.connections.lock().await;
        let conn = connections.get(id).ok_or_else(|| anyhow!("Connection not found"))?;
        f(conn)
    }

    /// Get access to the connections map lock. Callers can look up connections
    /// and call async methods on them. This is needed because with_connection
    /// cannot hold the lock across .await points easily.
    pub async fn get_connections(&self) -> tokio::sync::MutexGuard<'_, HashMap<Uuid, DriverConnection>> {
        self.connections.lock().await
    }

    /// Get a clone of the stored config for a connection.
    pub async fn get_config(&self, id: &Uuid) -> Option<ConnectionConfig> {
        let configs = self.configs.lock().await;
        configs.get(id).cloned()
    }

    /// Detect the driver type for a given connection ID.
    pub async fn get_driver_type(&self, id: &Uuid) -> Option<DriverType> {
        let connections = self.connections.lock().await;
        connections.get(id).map(|c| c.driver_type())
    }

    /// Get the db_type string ("postgres", "mysql", "sqlite") for a connection.
    pub async fn get_db_type_str(&self, id: &Uuid) -> Option<&'static str> {
        let connections = self.connections.lock().await;
        connections.get(id).map(|c| match c.driver_type() {
            DriverType::Postgres => "postgres",
            DriverType::MySQL => "mysql",
            DriverType::SQLite => "sqlite",
        })
    }
}
