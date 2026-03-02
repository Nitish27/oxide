use anyhow::{Result, anyhow};
use sqlx::postgres::{PgConnectOptions, PgSslMode};
use sqlx::{PgPool, Connection};
use uuid::Uuid;
use std::time::Duration;

use crate::core::ConnectionConfig;

pub struct PostgresDriver {
    pub pool: Option<PgPool>,
    pub id: Uuid,
}

impl PostgresDriver {
    pub fn new(id: Uuid) -> Self {
        Self { pool: None, id }
    }

    pub async fn connect(&mut self, config: &ConnectionConfig, password: Option<&str>) -> Result<()> {
        let host = config.host.as_deref().unwrap_or("localhost");
        let port = config.port.unwrap_or(5432);
        let user = config.username.as_deref().unwrap_or("postgres");
        let db = config.database.as_deref().unwrap_or("postgres");
        let pass = password.unwrap_or("");

        let mut opts = PgConnectOptions::new()
            .host(host)
            .port(port)
            .username(user)
            .password(pass)
            .database(db);

        // Apply SSL settings
        if config.ssl_enabled {
            let mode = match config.ssl_mode.as_deref() {
                Some("require") => PgSslMode::Require,
                Some("verify-ca") => PgSslMode::VerifyCa,
                Some("verify-full") => PgSslMode::VerifyFull,
                Some("prefer") => PgSslMode::Prefer,
                _ => PgSslMode::Disable,
            };
            opts = opts.ssl_mode(mode);

            if let Some(ca) = &config.ssl_ca_path {
                opts = opts.ssl_root_cert(ca);
            }
            if let Some(cert) = &config.ssl_cert_path {
                opts = opts.ssl_client_cert(cert);
            }
            if let Some(key) = &config.ssl_key_path {
                opts = opts.ssl_client_key(key);
            }
        }

        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect_with(opts)
            .await?;

        self.pool = Some(pool);
        Ok(())
    }

    /// Test connection without persisting a pool.
    pub async fn test_connection(config: &ConnectionConfig, password: Option<&str>) -> Result<()> {
        let host = config.host.as_deref().ok_or_else(|| anyhow!("Host required for Postgres"))?;
        let port = config.port.unwrap_or(5432);
        let user = config.username.as_deref().ok_or_else(|| anyhow!("Username required for Postgres"))?;
        let db = config.database.as_deref().ok_or_else(|| anyhow!("Database name required for Postgres"))?;
        let pass = password.unwrap_or("");

        let opts = PgConnectOptions::new()
            .host(host)
            .port(port)
            .username(user)
            .password(pass)
            .database(db);

        let mut conn = sqlx::postgres::PgConnection::connect_with(&opts).await?;
        conn.ping().await.map_err(|e| anyhow!("Connection/Ping failed: {}", e))
    }

    /// Get the pool, returning an error if not connected.
    pub fn pool(&self) -> Result<&PgPool> {
        self.pool.as_ref().ok_or_else(|| anyhow!("Postgres driver not connected"))
    }
}
