use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

/// ポーリング間隔（秒）
pub const POLLING_INTERVAL_SECONDS: u64 = 5;

/// ポイント計算設定（コンパイル時に埋め込み）
const POINTS_CONFIG_TOML: &str = include_str!("points_config.toml");

pub static POINTS_CONFIG: LazyLock<PointsConfig> =
    LazyLock::new(|| toml::from_str(POINTS_CONFIG_TOML).expect("Invalid points_config.toml"));

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
