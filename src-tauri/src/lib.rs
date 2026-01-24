mod config;
mod points;
mod sidecar;
mod state;
mod web_server;

use std::sync::Arc;
use tauri::{Emitter, Manager, State, WebviewWindowBuilder, webview::Cookie};
use tokio::sync::{RwLock, broadcast, mpsc};
use tokio::time::{Duration, interval};

use sidecar::SidecarManager;
use web_server::PointsPayload;

pub struct AppState {
    pub is_monitoring: RwLock<bool>,
    pub points: RwLock<points::PointState>,
    pub config: RwLock<config::Config>,
    pub sidecar: RwLock<Option<SidecarManager>>,
    pub raw_metrics: RwLock<points::RawMetrics>,
    pub monitoring_video_id: RwLock<Option<String>>,
    pub monitoring_channel_id: RwLock<Option<String>>,
    pub is_authenticated: RwLock<bool>,
    pub web_broadcast: broadcast::Sender<PointsPayload>,
    pub server_url: RwLock<Option<String>>,
}

#[tauri::command]
async fn start_monitoring(
    video_url: String,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let monitoring = state.is_monitoring.read().await;
        if *monitoring {
            return Err("Already monitoring".into());
        }
    }

    // Extract video ID
    let video_id = sidecar::extract_video_id(&video_url)?;
    println!("Starting monitoring for video: {}", video_id);

    // Create superchat event channel
    let (superchat_tx, mut superchat_rx) = mpsc::unbounded_channel();

    // Start sidecar
    let mut sidecar = SidecarManager::new();
    sidecar.set_superchat_handler(superchat_tx);
    sidecar.start(&app).await?;

    // Try to get cookies from YouTube login window for authentication
    if let Some(login_window) = app.get_webview_window("youtube-login") {
        let url: url::Url = "https://www.youtube.com".parse().unwrap();
        if let Ok(cookies) = login_window.cookies_for_url(url) {
            let cookie_str: String = cookies
                .iter()
                .map(|c| format!("{}={}", c.name(), c.value()))
                .collect::<Vec<_>>()
                .join("; ");
            if !cookie_str.is_empty()
                && let Err(e) = sidecar.set_cookies(&cookie_str).await
            {
                eprintln!("Failed to set cookies: {}", e);
            }
        }
    }

    // Initialize YouTube client
    let is_authenticated = sidecar.init().await?;
    println!(
        "YouTube client initialized (authenticated: {})",
        is_authenticated
    );

    // Store authentication status
    {
        let mut auth = state.is_authenticated.write().await;
        *auth = is_authenticated;
    }

    // Get initial live info
    let live_info = sidecar.get_live_info(&video_id).await?;
    if !live_info.is_live {
        sidecar.stop().await?;
        return Err("The video is not a live stream".into());
    }

    let channel_id = live_info.channel_id.clone();

    // Get initial subscriber count - use exact count if authenticated
    let initial_subscribers = if is_authenticated {
        match sidecar.get_exact_subscriber_count().await {
            Ok(count) => {
                println!("Got exact subscriber count: {}", count);
                count
            }
            Err(e) => {
                eprintln!("Failed to get exact subscriber count, falling back: {}", e);
                sidecar.get_subscriber_count(&channel_id).await?
            }
        }
    } else {
        sidecar.get_subscriber_count(&channel_id).await?
    };

    // Initialize raw metrics
    {
        let mut metrics = state.raw_metrics.write().await;
        *metrics = points::RawMetrics {
            superchat_amount: 0,
            concurrent_viewers: live_info.concurrent_viewers,
            like_count: live_info.like_count,
            initial_subscribers,
            current_subscribers: initial_subscribers,
        };
    }

    // Start live chat monitoring
    sidecar.start_live_chat(&video_id).await?;

    // Store sidecar and monitoring info
    {
        let mut sidecar_guard = state.sidecar.write().await;
        *sidecar_guard = Some(sidecar);
    }
    {
        let mut vid = state.monitoring_video_id.write().await;
        *vid = Some(video_id.clone());
    }
    {
        let mut cid = state.monitoring_channel_id.write().await;
        *cid = Some(channel_id.clone());
    }
    {
        let mut monitoring = state.is_monitoring.write().await;
        *monitoring = true;
    }

    // Emit initial points
    emit_points(&state, &app).await;

    // Spawn superchat handler
    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(superchat) = superchat_rx.recv().await {
            println!(
                "Superchat received: {} from {} - {}",
                superchat.amount, superchat.author, superchat.message
            );

            // Add superchat amount to metrics
            {
                let mut metrics = state_clone.raw_metrics.write().await;
                metrics.superchat_amount += superchat.amount;
            }

            // Recalculate and emit points
            emit_points(&state_clone, &app_clone).await;

            // Also emit superchat event for UI effects
            let _ = app_clone.emit("superchat", &superchat);
        }
    });

    // Spawn polling task
    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let polling_interval = {
            let config = state_clone.config.read().await;
            config.polling.interval_seconds
        };
        let mut ticker = interval(Duration::from_secs(polling_interval));

        loop {
            ticker.tick().await;

            // Check if still monitoring
            if !*state_clone.is_monitoring.read().await {
                break;
            }

            // Update metrics
            if let Err(e) = update_metrics(&state_clone).await {
                eprintln!("Failed to update metrics: {}", e);
                continue;
            }

            // Emit updated points
            emit_points(&state_clone, &app_clone).await;
        }

        println!("Polling task stopped");
    });

    println!("Monitoring started for: {}", video_id);
    Ok(())
}

async fn update_metrics(state: &Arc<AppState>) -> Result<(), String> {
    let video_id = {
        let vid = state.monitoring_video_id.read().await;
        vid.clone().ok_or("No video ID")?
    };
    let channel_id = {
        let cid = state.monitoring_channel_id.read().await;
        cid.clone().ok_or("No channel ID")?
    };
    let is_authenticated = *state.is_authenticated.read().await;

    let sidecar_guard = state.sidecar.read().await;
    let sidecar = sidecar_guard.as_ref().ok_or("Sidecar not running")?;

    // Get live info
    let live_info = sidecar.get_live_info(&video_id).await?;

    // Get current subscriber count - use exact count if authenticated
    let current_subscribers = if is_authenticated {
        match sidecar.get_exact_subscriber_count().await {
            Ok(count) => count,
            Err(e) => {
                eprintln!("Failed to get exact subscriber count, falling back: {}", e);
                sidecar.get_subscriber_count(&channel_id).await?
            }
        }
    } else {
        sidecar.get_subscriber_count(&channel_id).await?
    };

    // Update metrics
    {
        let mut metrics = state.raw_metrics.write().await;
        metrics.concurrent_viewers = live_info.concurrent_viewers;
        metrics.like_count = live_info.like_count;
        metrics.current_subscribers = current_subscribers;
    }

    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct PointsUpdatePayload {
    points: points::PointState,
    metrics: points::RawMetrics,
}

async fn emit_points(state: &Arc<AppState>, app: &tauri::AppHandle) {
    let (points, metrics) = {
        let metrics = state.raw_metrics.read().await;
        let config = state.config.read().await;
        let mut calculated = points::PointState::calculate_from_metrics(&metrics, &config.points);

        // Add manual points
        let current_points = state.points.read().await;
        calculated.manual = current_points.manual;
        calculated.total += current_points.manual;

        // Update stored points
        drop(current_points);
        let mut points_guard = state.points.write().await;
        *points_guard = calculated.clone();

        (calculated, metrics.clone())
    };

    let payload = PointsUpdatePayload {
        points: points.clone(),
        metrics: metrics.clone(),
    };
    let _ = app.emit("points-update", &payload);

    // Broadcast to web clients
    let _ = state.web_broadcast.send(PointsPayload { points, metrics });
}

#[tauri::command]
async fn stop_monitoring(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    {
        let mut monitoring = state.is_monitoring.write().await;
        *monitoring = false;
    }

    // Stop sidecar
    {
        let mut sidecar_guard = state.sidecar.write().await;
        if let Some(mut sidecar) = sidecar_guard.take() {
            sidecar.stop().await?;
        }
    }

    // Clear monitoring info
    {
        let mut vid = state.monitoring_video_id.write().await;
        *vid = None;
    }
    {
        let mut cid = state.monitoring_channel_id.write().await;
        *cid = None;
    }

    println!("Monitoring stopped");
    Ok(())
}

#[tauri::command]
async fn add_manual_points(
    amount: i64,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (points, metrics) = {
        let mut points = state.points.write().await;
        points.manual += amount;
        points.total += amount;
        let metrics = state.raw_metrics.read().await;
        (points.clone(), metrics.clone())
    };

    println!("Added {} manual points. Total: {}", amount, points.total);

    // Emit event with full payload (points + metrics)
    let payload = PointsUpdatePayload {
        points: points.clone(),
        metrics: metrics.clone(),
    };
    let _ = app.emit("points-update", &payload);

    // Broadcast to web clients
    let _ = state.web_broadcast.send(PointsPayload { points, metrics });

    Ok(())
}

#[tauri::command]
async fn get_points(state: State<'_, Arc<AppState>>) -> Result<points::PointState, String> {
    let points = state.points.read().await;
    Ok(points.clone())
}

#[tauri::command]
async fn reset_points(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Reset points
    {
        let mut points = state.points.write().await;
        *points = points::PointState::default();
    }

    // Reset raw metrics (keep initial_subscribers)
    {
        let mut metrics = state.raw_metrics.write().await;
        let initial_subs = metrics.initial_subscribers;
        *metrics = points::RawMetrics {
            initial_subscribers: initial_subs,
            current_subscribers: initial_subs,
            ..Default::default()
        };
    }

    let points = state.points.read().await.clone();
    let metrics = state.raw_metrics.read().await.clone();
    println!("Points reset");

    let payload = PointsUpdatePayload {
        points: points.clone(),
        metrics: metrics.clone(),
    };
    let _ = app.emit("points-update", &payload);

    // Broadcast to web clients
    let _ = state.web_broadcast.send(PointsPayload { points, metrics });

    Ok(())
}

#[tauri::command]
async fn open_viewer_window(app: tauri::AppHandle) -> Result<(), String> {
    let _viewer = WebviewWindowBuilder::new(
        &app,
        "viewer",
        tauri::WebviewUrl::App("/viewer.html".into()),
    )
    .title("YT Point - 視聴者用表示")
    .inner_size(450.0, 520.0)
    .transparent(true)
    .decorations(true)
    .always_on_top(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn open_youtube_login(app: tauri::AppHandle) -> Result<(), String> {
    // Close existing window if any
    if let Some(window) = app.get_webview_window("youtube-login") {
        let _ = window.close();
        // Wait a bit for the window to close
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    // Create new window
    let _login_window = WebviewWindowBuilder::new(
        &app,
        "youtube-login",
        tauri::WebviewUrl::External("https://studio.youtube.com".parse().unwrap()),
    )
    .title("YouTube Login")
    .inner_size(1000.0, 700.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_youtube_cookies(app: tauri::AppHandle) -> Result<String, String> {
    // Get or create the youtube-login window
    let window = match app.get_webview_window("youtube-login") {
        Some(w) => w,
        None => {
            // Create a hidden window to check cookies
            WebviewWindowBuilder::new(
                &app,
                "youtube-login",
                tauri::WebviewUrl::External("https://www.youtube.com".parse().unwrap()),
            )
            .title("YouTube Login")
            .inner_size(1000.0, 700.0)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?
        }
    };

    // Wait a bit for cookies to be available
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Use Tauri's cookies_for_url API to get all cookies including HTTP-only ones
    let url: url::Url = "https://www.youtube.com".parse().unwrap();
    let cookies: Vec<Cookie<'_>> = window
        .cookies_for_url(url)
        .map_err(|e| format!("Failed to get cookies: {}", e))?;

    // Format cookies as a string
    let cookie_str: String = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");

    println!("Retrieved {} cookies", cookies.len());

    // Check for auth cookies
    let has_sapisid = cookies.iter().any(|c| c.name() == "SAPISID");
    let has_secure_3psid = cookies.iter().any(|c| c.name() == "__Secure-3PSID");

    if has_sapisid && has_secure_3psid {
        println!("Auth cookies found: SAPISID and __Secure-3PSID");
    } else {
        println!("Warning: Some auth cookies may be missing");
        println!("  SAPISID: {}", has_sapisid);
        println!("  __Secure-3PSID: {}", has_secure_3psid);
    }

    Ok(cookie_str)
}

#[tauri::command]
async fn get_server_url(state: State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    let url = state.server_url.read().await;
    Ok(url.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create broadcast channel for web clients
    let (web_tx, _) = broadcast::channel::<PointsPayload>(16);

    let app_state = Arc::new(AppState {
        is_monitoring: RwLock::new(false),
        points: RwLock::new(points::PointState::default()),
        config: RwLock::new(config::Config::load().unwrap_or_default()),
        sidecar: RwLock::new(None),
        raw_metrics: RwLock::new(points::RawMetrics::default()),
        monitoring_video_id: RwLock::new(None),
        monitoring_channel_id: RwLock::new(None),
        is_authenticated: RwLock::new(false),
        web_broadcast: web_tx.clone(),
        server_url: RwLock::new(None),
    });

    let app_state_clone = app_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .setup(move |_app| {
            // Start web server
            let state = app_state_clone.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(server) = web_server::WebServer::new(web_tx) {
                    let url = server.url();
                    println!("Starting OBS viewer server at {}", url);
                    {
                        let mut server_url = state.server_url.write().await;
                        *server_url = Some(url);
                    }
                    if let Err(e) = server.start().await {
                        eprintln!("Failed to start web server: {}", e);
                    }
                } else {
                    eprintln!("Failed to find available port for web server (1420-1450)");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_monitoring,
            stop_monitoring,
            add_manual_points,
            get_points,
            reset_points,
            open_viewer_window,
            open_youtube_login,
            get_youtube_cookies,
            get_server_url,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { .. },
                ..
            } => {
                // If main window is closed, exit the app
                if label == "main" {
                    let state = app.state::<Arc<AppState>>();
                    let state = state.inner().clone();
                    tauri::async_runtime::block_on(async move {
                        // Stop sidecar if running
                        let mut sidecar_guard = state.sidecar.write().await;
                        if let Some(mut sidecar) = sidecar_guard.take() {
                            let _ = sidecar.stop().await;
                            println!("Sidecar stopped on exit");
                        }
                    });
                    std::process::exit(0);
                }
            }
            tauri::RunEvent::ExitRequested { api, .. } => {
                // Don't prevent exit
                let _ = api;
            }
            tauri::RunEvent::Exit => {
                // Cleanup on exit
                let state = app.state::<Arc<AppState>>();
                let state = state.inner().clone();
                tauri::async_runtime::block_on(async move {
                    // Stop sidecar if running
                    let mut sidecar_guard = state.sidecar.write().await;
                    if let Some(mut sidecar) = sidecar_guard.take() {
                        let _ = sidecar.stop().await;
                        println!("Sidecar stopped on exit");
                    }
                });
            }
            _ => {}
        });
}
