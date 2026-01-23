mod config;
mod points;
mod state;

use std::sync::Arc;
use tauri::{State, WebviewWindowBuilder};
use tokio::sync::RwLock;

pub struct AppState {
    pub is_monitoring: RwLock<bool>,
    pub points: RwLock<points::PointState>,
    pub config: RwLock<config::Config>,
}

#[tauri::command]
async fn start_monitoring(
    video_url: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut monitoring = state.is_monitoring.write().await;
    if *monitoring {
        return Err("Already monitoring".into());
    }
    *monitoring = true;

    // TODO: Start sidecar process and begin monitoring
    println!("Starting monitoring for: {}", video_url);

    Ok(())
}

#[tauri::command]
async fn stop_monitoring(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut monitoring = state.is_monitoring.write().await;
    *monitoring = false;

    // TODO: Stop sidecar process
    println!("Stopping monitoring");

    Ok(())
}

#[tauri::command]
async fn add_manual_points(amount: i64, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut points = state.points.write().await;
    points.manual += amount;
    points.total += amount;

    println!("Added {} manual points. Total: {}", amount, points.total);

    Ok(())
}

#[tauri::command]
async fn get_points(state: State<'_, Arc<AppState>>) -> Result<points::PointState, String> {
    let points = state.points.read().await;
    Ok(points.clone())
}

#[tauri::command]
async fn open_viewer_window(app: tauri::AppHandle) -> Result<(), String> {
    let _viewer = WebviewWindowBuilder::new(
        &app,
        "viewer",
        tauri::WebviewUrl::App("/viewer.html".into()),
    )
    .title("YT Point - 視聴者用表示")
    .inner_size(400.0, 300.0)
    .transparent(true)
    .decorations(true)
    .always_on_top(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState {
        is_monitoring: RwLock::new(false),
        points: RwLock::new(points::PointState::default()),
        config: RwLock::new(config::Config::load().unwrap_or_default()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_monitoring,
            stop_monitoring,
            add_manual_points,
            get_points,
            open_viewer_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
