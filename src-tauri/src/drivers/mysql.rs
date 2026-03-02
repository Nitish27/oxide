use anyhow::{Result, anyhow};
use sqlx::mysql::{MySqlConnectOptions, MySqlSslMode};
use sqlx::{MySqlPool, Connection};
use uuid::Uuid;
use std::time::Duration;

use crate::core::ConnectionConfig;

pub struct MySQLDriver {
    pub pool: Option<MySqlPool>,
    pub id: Uuid,
}

impl MySQLDriver {
    pub fn new(id: Uuid) -> Self {
        Self { pool: None, id }
    }

    pub async fn connect(&mut self, config: &ConnectionConfig, password: Option<&str>) -> Result<()> {
        let host = config.host.as_deref().unwrap_or("localhost");
        let port = config.port.unwrap_or(3306);
        let user = config.username.as_deref().unwrap_or("root");
        let db = config.database.as_deref().unwrap_or("");
        let pass = password.unwrap_or("");

        let mut opts = MySqlConnectOptions::new()
            .host(host)
            .port(port)
            .username(user)
            .password(pass)
            .database(db);

        if config.ssl_enabled {
            let mode = match config.ssl_mode.as_deref() {
                Some("require") | Some("verify-ca") | Some("verify-full") => MySqlSslMode::Required,
                _ => MySqlSslMode::Disabled,
            };
            opts = opts.ssl_mode(mode);

            if let Some(ca) = &config.ssl_ca_path {
                opts = opts.ssl_ca(ca);
            }
        }

        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect_with(opts)
            .await?;

        self.pool = Some(pool);
        Ok(())
    }

    /// Test connection without persisting a pool.
    pub async fn test_connection(config: &ConnectionConfig, password: Option<&str>) -> Result<()> {
        let host = config.host.as_deref().ok_or_else(|| anyhow!("Host required for MySQL"))?;
        let port = config.port.unwrap_or(3306);
        let user = config.username.as_deref().ok_or_else(|| anyhow!("Username required for MySQL"))?;
        let db = config.database.as_deref().ok_or_else(|| anyhow!("Database name required for MySQL"))?;
        let pass = password.unwrap_or("");

        let opts = MySqlConnectOptions::new()
            .host(host)
            .port(port)
            .username(user)
            .password(pass)
            .database(db);

        let mut conn = sqlx::mysql::MySqlConnection::connect_with(&opts).await?;
        conn.ping().await.map_err(|e| anyhow!("Connection/Ping failed: {}", e))
    }

    /// Get the pool, returning an error if not connected.
    pub fn pool(&self) -> Result<&MySqlPool> {
        self.pool.as_ref().ok_or_else(|| anyhow!("MySQL driver not connected"))
    }
}
