use axum::{
    Router,
    extract::State,
    response::{Html, Sse, sse::Event},
    routing::get,
};
use futures::stream::Stream;
use std::{convert::Infallible, net::TcpListener, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use tower_http::cors::CorsLayer;

use crate::points::{PointState, RawMetrics};

#[derive(Clone, serde::Serialize)]
pub struct PointsPayload {
    pub points: PointState,
    pub metrics: RawMetrics,
}

pub struct WebServer {
    port: u16,
    tx: broadcast::Sender<PointsPayload>,
}

impl WebServer {
    pub fn new(tx: broadcast::Sender<PointsPayload>) -> Option<Self> {
        // Find available port in range 1430-1460 (avoid 1420 used by vite dev server)
        let port = (1430..=1460).find(|&p| TcpListener::bind(("127.0.0.1", p)).is_ok())?;
        Some(Self { port, tx })
    }

    pub fn url(&self) -> String {
        format!("http://localhost:{}", self.port)
    }

    pub async fn start(self) -> Result<(), String> {
        let addr = format!("127.0.0.1:{}", self.port);
        let tx = Arc::new(self.tx);

        let app = Router::new()
            .route("/", get(serve_viewer))
            .route("/events", get(sse_handler))
            .layer(CorsLayer::permissive())
            .with_state(tx);

        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| e.to_string())?;

        println!("OBS Viewer server started at http://{}", addr);

        tokio::spawn(async move {
            axum::serve(listener, app).await.ok();
        });

        Ok(())
    }
}

async fn serve_viewer() -> Html<&'static str> {
    Html(VIEWER_HTML)
}

async fn sse_handler(
    State(tx): State<Arc<broadcast::Sender<PointsPayload>>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|result: Result<PointsPayload, _>| {
        result.ok().map(|payload| {
            Ok(Event::default()
                .event("points")
                .data(serde_json::to_string(&payload).unwrap_or_default()))
        })
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}

const VIEWER_HTML: &str = r##"<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YT Point Viewer</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: transparent;
  min-height: 100vh;
  overflow: hidden;
}
.viewer-container {
  width: 100%;
  height: 100vh;
  padding: 20px;
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%);
  border: 2px solid rgba(233, 69, 96, 0.5);
  box-shadow: 0 0 20px rgba(233, 69, 96, 0.3), 0 0 40px rgba(233, 69, 96, 0.1), inset 0 0 60px rgba(0, 0, 0, 0.3);
}
.header { text-align: center; margin-bottom: 16px; }
.title {
  font-size: 14px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 3px;
}
.score-section { text-align: center; margin-bottom: 20px; }
.score {
  font-size: 64px;
  font-weight: 700;
  background: linear-gradient(90deg, #ffd700, #ff8c00, #ff6b00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  position: relative;
  display: inline-block;
}
.score::after {
  content: 'PT';
  font-size: 20px;
  position: absolute;
  bottom: 10px;
  margin-left: 8px;
  background: linear-gradient(90deg, #ffd700, #ff8c00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.progress-section { margin-bottom: 20px; }
.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}
.progress-bar {
  height: 24px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #e94560, #ff6b6b, #ffd700);
  border-radius: 12px;
  transition: width 0.5s ease-out;
  position: relative;
  box-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
}
.progress-fill::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%);
  border-radius: 12px 12px 0 0;
}
.progress-glow {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 0 10px #fff, 0 0 20px #ffd700;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
  50% { opacity: 0.7; transform: translateY(-50%) scale(1.2); }
}
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat-item {
  background: rgba(0, 0, 0, 0.3);
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.stat-icon { font-size: 16px; margin-bottom: 4px; }
.stat-value { font-size: 20px; font-weight: 600; color: #fff; }
.stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
.point-popup {
  position: fixed;
  font-size: 24px;
  font-weight: 700;
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  pointer-events: none;
  animation: floatUp 1.5s ease-out forwards;
  z-index: 1000;
}
@keyframes floatUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-60px) scale(1.2); }
}
.superchat-effect {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
  animation: superFlash 0.5s ease-out forwards;
  pointer-events: none;
  z-index: 999;
}
@keyframes superFlash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
.connection-status {
  position: fixed;
  top: 5px;
  right: 5px;
  font-size: 10px;
  color: #666;
  opacity: 0.5;
}
.connection-status.connected { color: #4caf50; }
.connection-status.disconnected { color: #f44336; }
</style>
</head>
<body>
<div class="viewer-container">
  <div class="header"><div class="title">LIVE POINTS</div></div>
  <div class="score-section"><div class="score" id="score">0</div></div>
  <div class="progress-section">
    <div class="progress-label">
      <span>Progress</span>
      <span id="progress-text">0 / 1,000</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="progress-fill" style="width: 0%">
        <div class="progress-glow"></div>
      </div>
    </div>
  </div>
  <div class="stats">
    <div class="stat-item">
      <div class="stat-icon">💰</div>
      <div class="stat-value" id="superchat">0</div>
      <div class="stat-label">Superchat</div>
    </div>
    <div class="stat-item">
      <div class="stat-icon">👥</div>
      <div class="stat-value" id="viewers">0</div>
      <div class="stat-label">Viewers</div>
    </div>
    <div class="stat-item">
      <div class="stat-icon">👍</div>
      <div class="stat-value" id="likes">0</div>
      <div class="stat-label">Likes</div>
    </div>
    <div class="stat-item">
      <div class="stat-icon">🔔</div>
      <div class="stat-value" id="subs">0</div>
      <div class="stat-label">New Subs</div>
    </div>
  </div>
</div>
<div class="connection-status" id="status">Connecting...</div>
<script>
const TARGET_POINTS = 1000;
let currentScore = 0;
let displayedScore = 0;
let animationFrame = null;

function formatNumber(n) {
  return n.toLocaleString();
}

function updateDisplay(points, metrics) {
  const prevScore = currentScore;
  currentScore = points.total;

  // Animate score
  if (animationFrame) cancelAnimationFrame(animationFrame);
  function animate() {
    if (displayedScore === currentScore) return;
    const diff = currentScore - displayedScore;
    const step = Math.ceil(Math.abs(diff) / 10) || 1;
    displayedScore = diff > 0
      ? Math.min(displayedScore + step, currentScore)
      : Math.max(displayedScore - step, currentScore);
    document.getElementById('score').textContent = formatNumber(displayedScore);
    const progress = Math.min((displayedScore / TARGET_POINTS) * 100, 100);
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent =
      formatNumber(displayedScore) + ' / ' + formatNumber(TARGET_POINTS);
    if (displayedScore !== currentScore) {
      animationFrame = requestAnimationFrame(animate);
    }
  }
  animate();

  // Update stats
  document.getElementById('superchat').textContent = formatNumber(metrics.superchat_amount);
  document.getElementById('viewers').textContent = formatNumber(metrics.concurrent_viewers);
  document.getElementById('likes').textContent = formatNumber(metrics.like_count);
  document.getElementById('subs').textContent = formatNumber(
    metrics.current_subscribers - metrics.initial_subscribers
  );

  // Show popup on increase
  const diff = currentScore - prevScore;
  if (diff > 0 && prevScore > 0) {
    showPopup(diff);
    if (diff >= 10) showSuperEffect();
  }
}

function showPopup(amount) {
  const popup = document.createElement('div');
  popup.className = 'point-popup';
  popup.textContent = '+' + amount;
  popup.style.left = (50 + (Math.random() - 0.5) * 30) + '%';
  popup.style.top = '40%';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1500);
}

function showSuperEffect() {
  const effect = document.createElement('div');
  effect.className = 'superchat-effect';
  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 500);
}

function connect() {
  const status = document.getElementById('status');
  status.textContent = 'Connecting...';
  status.className = 'connection-status';

  const eventSource = new EventSource('/events');

  eventSource.onopen = () => {
    status.textContent = 'Connected';
    status.className = 'connection-status connected';
  };

  eventSource.addEventListener('points', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateDisplay(data.points, data.metrics);
    } catch (err) {
      console.error('Failed to parse event data:', err);
    }
  });

  eventSource.onerror = () => {
    status.textContent = 'Disconnected';
    status.className = 'connection-status disconnected';
    eventSource.close();
    setTimeout(connect, 3000);
  };
}

connect();
</script>
</body>
</html>
"##;
