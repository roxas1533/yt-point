use serde::{Deserialize, Serialize};

use crate::config::PointsConfig;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PointState {
    /// 合計ポイント
    pub total: i64,
    /// スーパーチャットからのポイント
    pub superchat: i64,
    /// 同時接続者数からのポイント
    pub concurrent: i64,
    /// 高評価からのポイント
    pub likes: i64,
    /// 新規登録者からのポイント
    pub subscribers: i64,
    /// 手動追加ポイント
    pub manual: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawMetrics {
    /// スーパーチャット累計金額（円）
    pub superchat_amount: i64,
    /// 現在の同時接続者数
    pub concurrent_viewers: i64,
    /// 高評価数
    pub like_count: i64,
    /// 配信開始時のチャンネル登録者数
    pub initial_subscribers: i64,
    /// 現在のチャンネル登録者数
    pub current_subscribers: i64,
}

impl PointState {
    pub fn calculate_from_metrics(metrics: &RawMetrics, config: &PointsConfig) -> Self {
        let superchat = metrics.superchat_amount / config.superchat_rate;
        let concurrent = metrics.concurrent_viewers / config.concurrent_rate;
        let likes = metrics.like_count / config.like_rate;
        let new_subscribers = metrics.current_subscribers - metrics.initial_subscribers;
        let subscribers = new_subscribers / config.subscriber_rate;

        Self {
            total: superchat + concurrent + likes + subscribers,
            superchat,
            concurrent,
            likes,
            subscribers,
            manual: 0,
        }
    }

    pub fn add_manual(&mut self, amount: i64) {
        self.manual += amount;
        self.total += amount;
    }
}
