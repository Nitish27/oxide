use anyhow::{Result, anyhow};
use sqlx::{SqlitePool, Connection};
use uuid::Uuid;
use std::time::Duration;

use crate::core::ConnectionConfig;

pub struct SQLiteDriver {
    pub pool: Option<SqlitePool>,
    pub id: Uuid,
}

impl SQLiteDriver {
    pub fn new(id: Uuid) -> Self {
        Self { pool: None, id }
    }

    pub async fn connect(&mut self, config: &ConnectionConfig, _password: Option<&str>) -> Result<()> {
        let db_path = config.database.as_deref().ok_or_else(|| anyhow!("Path required for SQLite"))?;
        let url = format!("sqlite:{}", db_path);

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(5))
            .connect(&url)
            .await
            .map_err(|e| anyhow!("Failed to connect to SQLite: {}", e))?;

        self.pool = Some(pool);
        Ok(())
    }

    /// Test connection without persisting a pool.
    pub async fn test_connection(config: &ConnectionConfig) -> Result<()> {
        let db_path = config.database.as_deref().ok_or_else(|| anyhow!("Path required for SQLite"))?;
        let opts = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db_path);

        let mut conn = sqlx::sqlite::SqliteConnection::connect_with(&opts).await?;
        conn.ping().await.map_err(|e| anyhow!("Connection/Ping failed: {}", e))
    }

    /// Get the pool, returning an error if not connected.
    pub fn pool(&self) -> Result<&SqlitePool> {
        self.pool.as_ref().ok_or_else(|| anyhow!("SQLite driver not connected"))
    }
}
