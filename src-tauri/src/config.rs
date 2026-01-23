use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointsConfig {
    /// スーパーチャットのレート（円 / ポイント）
    pub superchat_rate: i64,
    /// 同時接続者数のレート（人 / ポイント）
    pub concurrent_rate: i64,
    /// 高評価のレート（件 / ポイント）
    pub like_rate: i64,
    /// 新規登録者のレート（人 / ポイント）
    pub subscriber_rate: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Webサーバーのポート
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollingConfig {
    /// ポーリング間隔（秒）
    pub interval_seconds: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    pub points: PointsConfig,
    pub server: ServerConfig,
    pub polling: PollingConfig,
}

impl Default for PointsConfig {
    fn default() -> Self {
        Self {
            superchat_rate: 100,
            concurrent_rate: 100,
            like_rate: 10,
            subscriber_rate: 1,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self { port: 8080 }
    }
}

impl Default for PollingConfig {
    fn default() -> Self {
        Self {
            interval_seconds: 5,
        }
    }
}

impl Config {
    pub fn config_path() -> Option<PathBuf> {
        ProjectDirs::from("com", "ytpoint", "yt-point")
            .map(|dirs| dirs.config_dir().join("config.toml"))
    }

    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        let path = Self::config_path().ok_or("Could not determine config path")?;

        if !path.exists() {
            let config = Config::default();
            config.save()?;
            return Ok(config);
        }

        let content = fs::read_to_string(&path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path().ok_or("Could not determine config path")?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let content = toml::to_string_pretty(self)?;
        fs::write(&path, content)?;
        Ok(())
    }
}
