use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::async_runtime::Mutex;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, Serialize)]
struct RpcRequest {
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RpcResponse {
    id: u64,
    result: Option<serde_json::Value>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuperchatEventData {
    pub id: String,
    pub author: String,
    pub amount: i64,
    pub currency: String,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Deserialize)]
struct PushEvent {
    event: EventPayload,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "data")]
enum EventPayload {
    #[serde(rename = "superchat")]
    Superchat(SuperchatEventData),
}

#[derive(Debug, Clone, Deserialize)]
pub struct LiveInfo {
    #[serde(rename = "videoId")]
    pub video_id: String,
    pub title: String,
    #[serde(rename = "channelId")]
    pub channel_id: String,
    #[serde(rename = "channelName")]
    pub channel_name: String,
    #[serde(rename = "concurrentViewers")]
    pub concurrent_viewers: i64,
    #[serde(rename = "likeCount", default)]
    pub like_count: Option<i64>,
    #[serde(rename = "isLive")]
    pub is_live: bool,
}

type ResponseSender = oneshot::Sender<Result<serde_json::Value, String>>;
type PendingRequests = Arc<Mutex<HashMap<u64, ResponseSender>>>;

pub struct SidecarManager {
    child: Arc<Mutex<Option<CommandChild>>>,
    request_id: AtomicU64,
    pending: PendingRequests,
    superchat_tx: Option<mpsc::UnboundedSender<SuperchatEventData>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            request_id: AtomicU64::new(0),
            pending: Arc::new(Mutex::new(HashMap::new())),
            superchat_tx: None,
        }
    }

    pub fn set_superchat_handler(&mut self, tx: mpsc::UnboundedSender<SuperchatEventData>) {
        self.superchat_tx = Some(tx);
    }

    pub async fn start(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let sidecar = app
            .shell()
            .sidecar("youtube-sidecar")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        let (mut rx, child) = sidecar
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        {
            let mut child_guard = self.child.lock().await;
            *child_guard = Some(child);
        }

        let pending = self.pending.clone();
        let superchat_tx = self.superchat_tx.clone();

        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let text = String::from_utf8_lossy(&line);
                        for line in text.lines() {
                            if line.is_empty() {
                                continue;
                            }
                            Self::handle_stdout_line(line, &pending, &superchat_tx).await;
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        let text = String::from_utf8_lossy(&line);
                        eprintln!("[sidecar] {}", text);
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!("[sidecar] Terminated: {:?}", payload);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    async fn handle_stdout_line(
        line: &str,
        pending: &PendingRequests,
        superchat_tx: &Option<mpsc::UnboundedSender<SuperchatEventData>>,
    ) {
        // Try parsing as push event first
        if let Ok(push) = serde_json::from_str::<PushEvent>(line) {
            match push.event {
                EventPayload::Superchat(data) => {
                    if let Some(tx) = superchat_tx {
                        let _ = tx.send(data);
                    }
                }
            }
            return;
        }

        // Try parsing as RPC response
        if let Ok(response) = serde_json::from_str::<RpcResponse>(line) {
            let mut pending = pending.lock().await;
            if let Some(sender) = pending.remove(&response.id) {
                let result = if let Some(error) = response.error {
                    Err(error)
                } else {
                    Ok(response.result.unwrap_or(serde_json::Value::Null))
                };
                let _ = sender.send(result);
            }
        }
    }

    pub async fn call(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst) + 1;
        let request = RpcRequest {
            id,
            method: method.to_string(),
            params,
        };

        let json = serde_json::to_string(&request).map_err(|e| e.to_string())?;

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, tx);
        }

        {
            let mut child_guard = self.child.lock().await;
            let child = child_guard
                .as_mut()
                .ok_or_else(|| "Sidecar not running".to_string())?;
            child
                .write((json + "\n").as_bytes())
                .map_err(|e| format!("Failed to write to sidecar: {}", e))?;
        }

        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Response channel closed".to_string()),
            Err(_) => {
                let mut pending = self.pending.lock().await;
                pending.remove(&id);
                Err("Request timeout".to_string())
            }
        }
    }

    pub async fn init(&self) -> Result<bool, String> {
        let result = self.call("init", None).await?;
        let authenticated = result["authenticated"].as_bool().unwrap_or(false);
        Ok(authenticated)
    }

    pub async fn set_cookies(&self, cookies: &str) -> Result<(), String> {
        self.call(
            "setCookies",
            Some(serde_json::json!({ "cookies": cookies })),
        )
        .await?;
        Ok(())
    }

    pub async fn get_live_info(&self, video_id: &str) -> Result<LiveInfo, String> {
        let result = self
            .call(
                "getLiveInfo",
                Some(serde_json::json!({ "videoId": video_id })),
            )
            .await?;
        serde_json::from_value(result).map_err(|e| e.to_string())
    }

    pub async fn get_subscriber_count(&self, channel_id: &str) -> Result<i64, String> {
        let result = self
            .call(
                "getSubscriberCount",
                Some(serde_json::json!({ "channelId": channel_id })),
            )
            .await?;
        result["count"]
            .as_i64()
            .ok_or_else(|| "Invalid subscriber count".to_string())
    }

    pub async fn get_exact_subscriber_count(&self) -> Result<i64, String> {
        let result = self.call("getExactSubscriberCount", None).await?;
        result["count"]
            .as_i64()
            .ok_or_else(|| "Invalid subscriber count".to_string())
    }

    pub async fn start_live_chat(&self, video_id: &str) -> Result<(), String> {
        self.call(
            "startLiveChat",
            Some(serde_json::json!({ "videoId": video_id })),
        )
        .await?;
        Ok(())
    }

    pub async fn stop_live_chat(&self) -> Result<(), String> {
        self.call("stopLiveChat", None).await?;
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        // Stop live chat first
        {
            let child_guard = self.child.lock().await;
            if child_guard.is_some() {
                drop(child_guard);
                let _ = self.stop_live_chat().await;
            }
        }

        let mut child_guard = self.child.lock().await;
        if let Some(child) = child_guard.take() {
            child.kill().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        // Try to kill the sidecar synchronously when dropped
        if let Ok(mut guard) = self.child.try_lock()
            && let Some(child) = guard.take()
        {
            let _ = child.kill();
            println!("Sidecar killed on drop");
        }
    }
}

/// Extract video ID from YouTube URL or return as-is if already an ID
pub fn extract_video_id(url_or_id: &str) -> Result<String, String> {
    let url_or_id = url_or_id.trim();

    // If it looks like a video ID (11 characters, alphanumeric + - _)
    if url_or_id.len() == 11
        && url_or_id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Ok(url_or_id.to_string());
    }

    // Try to parse as URL
    if let Ok(url) = url::Url::parse(url_or_id) {
        // youtube.com/watch?v=VIDEO_ID
        if let Some(host) = url.host_str() {
            if host.contains("youtube.com") {
                for (key, value) in url.query_pairs() {
                    if key == "v" {
                        return Ok(value.to_string());
                    }
                }
            }
            // youtu.be/VIDEO_ID
            if host == "youtu.be"
                && let Some(path) = url.path_segments()
                && let Some(id) = path.into_iter().next()
                && !id.is_empty()
            {
                return Ok(id.to_string());
            }
        }
    }

    Err("Invalid YouTube URL or video ID".to_string())
}
