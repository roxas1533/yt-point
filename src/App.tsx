import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SquareArrowOutUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface PointState {
  total: number;
  superchat: number;
  concurrent: number;
  likes: number;
  subscribers: number;
  manual: number;
}

interface RawMetrics {
  superchat_amount: number;
  concurrent_viewers: number;
  like_count: number;
  initial_subscribers: number;
  current_subscribers: number;
}

interface PointsUpdatePayload {
  points: PointState;
  metrics: RawMetrics;
}

function App() {
  const [videoUrl, setVideoUrl] = useState("");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [inputShake, setInputShake] = useState(false);
  const [points, setPoints] = useState<PointState>({
    total: 0,
    superchat: 0,
    concurrent: 0,
    likes: 0,
    subscribers: 0,
    manual: 0,
  });
  const [metrics, setMetrics] = useState<RawMetrics>({
    superchat_amount: 0,
    concurrent_viewers: 0,
    like_count: 0,
    initial_subscribers: 0,
    current_subscribers: 0,
  });

  useEffect(() => {
    const unlistenPoints = listen<PointsUpdatePayload>("points-update", (event) => {
      setPoints(event.payload.points);
      setMetrics(event.payload.metrics);
    });

    const unlistenCookies = listen<string>("youtube-cookies", (event) => {
      console.log("YouTube cookies received:", event.payload);
      // Check if we got important cookies
      const cookies = event.payload;
      if (cookies.includes("SAPISID") || cookies.includes("__Secure")) {
        console.log("Auth cookies found!");
      } else {
        console.log("Warning: HTTP-only auth cookies not accessible via document.cookie");
      }
    });

    return () => {
      unlistenPoints.then((fn) => fn());
      unlistenCookies.then((fn) => fn());
    };
  }, []);

  const toggleMonitoring = async () => {
    const newState = !isMonitoring;

    // ロード中にオフにする場合はキャンセル
    if (isLoading && !newState) {
      setIsMonitoring(false);
      setIsLoading(false);
      try {
        await invoke("stop_monitoring");
      } catch (e) {
        console.error("Failed to cancel monitoring:", e);
      }
      return;
    }

    // ロード中にオンにしようとした場合は無視
    if (isLoading) return;

    setIsMonitoring(newState);
    setIsLoading(true);
    try {
      if (newState) {
        await invoke("start_monitoring", { videoUrl });
      } else {
        await invoke("stop_monitoring");
      }
    } catch (e) {
      console.error("Failed to toggle monitoring:", e);
      setIsMonitoring(!newState);
    } finally {
      setIsLoading(false);
    }
  };

  const addManualPoints = async (amount: number) => {
    try {
      await invoke("add_manual_points", { amount });
      // State will be updated by the points-update event listener
    } catch (e) {
      console.error("Failed to add points:", e);
    }
  };

  const openViewerWindow = async () => {
    try {
      await invoke("open_viewer_window");
    } catch (e) {
      console.error("Failed to open viewer window:", e);
    }
  };

  const resetPoints = async () => {
    if (!window.confirm("ポイントをリセットしますか？")) {
      return;
    }
    try {
      await invoke("reset_points");
      // State will be updated by the points-update event listener
    } catch (e) {
      console.error("Failed to reset points:", e);
    }
  };

  const openYouTubeLogin = async () => {
    try {
      await invoke("open_youtube_login");
    } catch (e) {
      console.error("Failed to open login:", e);
    }
  };

  const checkLoginStatus = useCallback(async () => {
    try {
      const cookies = await invoke<string>("get_youtube_cookies");
      const loggedIn = cookies.includes("SAPISID") && cookies.includes("__Secure-3PSID");
      setIsLoggedIn(loggedIn);
      return loggedIn;
    } catch {
      setIsLoggedIn(false);
      return false;
    }
  }, []);

  // Check login status and get server URL on mount
  useEffect(() => {
    checkLoginStatus();
    invoke<string | null>("get_server_url").then((url) => {
      setServerUrl(url);
    });
  }, [checkLoginStatus]);

  // Listen for login status from YouTube login window close
  useEffect(() => {
    const unlisten = listen<boolean>("youtube-login-status", (event) => {
      setIsLoggedIn(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className={`container ${isMonitoring ? "connected" : "disconnected"}`}>
      <header className="header">
        <div className="header-title">
          <h1>YT Point</h1>
          <p className="subtitle">YouTubeライブ配信ポイント集計</p>
        </div>
        <button
          type="button"
          className={`login-button ${isLoggedIn ? "logged-in" : ""}`}
          onClick={openYouTubeLogin}
          title={isLoggedIn ? "YouTube ログイン済み" : "YouTube にログイン"}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <span className="login-status">{isLoggedIn ? "ログイン済" : "ログイン"}</span>
        </button>
      </header>

      <div className="section">
        <h2>配信設定</h2>
        <div className="input-row">
          <input
            type="text"
            className={inputShake ? "shake" : ""}
            placeholder="YouTubeライブ配信URLまたはVideo ID"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            disabled={isMonitoring}
            onAnimationEnd={() => setInputShake(false)}
          />
          <div className="monitoring-control">
            <span className="toggle-label">接続</span>
            <div className="switch-wrapper">
              <Switch
                checked={isMonitoring}
                onCheckedChange={toggleMonitoring}
                disabled={!isMonitoring && (isLoading || !videoUrl.trim())}
              />
              {!isMonitoring && !videoUrl.trim() && (
                <button
                  type="button"
                  className="switch-overlay"
                  onClick={() => setInputShake(true)}
                  aria-label="URLを入力してください"
                />
              )}
            </div>
          </div>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="viewer-button"
            draggable={!!serverUrl}
            onDragStart={(e) => {
              if (serverUrl) {
                e.dataTransfer.effectAllowed = "copyLink";
                e.dataTransfer.setData("text/uri-list", serverUrl);
                e.dataTransfer.setData("text/plain", serverUrl);
              }
            }}
            onClick={openViewerWindow}
            title={serverUrl ? `OBSへドラッグ: ${serverUrl}` : "視聴者用ウィンドウを開く"}
          >
            <span>視聴者用ウィンドウ</span>
            <SquareArrowOutUpRight size={18} />
          </button>
        </div>
      </div>

      <div className="section">
        <h2>現在のポイント</h2>
        <div className="points-display">
          {isLoading ? (
            <Skeleton className="h-16 w-48" />
          ) : (
            <div className="total-points">{points.total} pt</div>
          )}
        </div>
        {isLoading ? (
          <div className="points-breakdown">
            {["superchat", "concurrent", "likes", "subscribers", "manual"].map((id) => (
              <div key={id} className="point-item">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="points-breakdown">
            <div className="point-item">
              <span className="label">スーパーチャット</span>
              <span className="value">{points.superchat} pt</span>
              <span className="raw">({metrics.superchat_amount.toLocaleString()}円)</span>
            </div>
            <div className="point-item">
              <span className="label">同時接続者数</span>
              <span className="value">{points.concurrent} pt</span>
              <span className="raw">({metrics.concurrent_viewers.toLocaleString()}人)</span>
            </div>
            <div className="point-item">
              <span className="label">高評価</span>
              <span className="value">{points.likes} pt</span>
              <span className="raw">({metrics.like_count.toLocaleString()}件)</span>
            </div>
            <div className="point-item">
              <span className="label">新規登録者</span>
              <span className="value">{points.subscribers} pt</span>
              <span className="raw">
                (+{(metrics.current_subscribers - metrics.initial_subscribers).toLocaleString()}人)
              </span>
            </div>
            <div className="point-item">
              <span className="label">手動追加</span>
              <span className="value">{points.manual} pt</span>
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <h2>手動ポイント追加</h2>
        <div className="button-group">
          <button type="button" onClick={() => addManualPoints(1)}>
            +1
          </button>
          <button type="button" onClick={() => addManualPoints(5)}>
            +5
          </button>
          <button type="button" onClick={() => addManualPoints(10)}>
            +10
          </button>
          <button type="button" onClick={() => addManualPoints(50)}>
            +50
          </button>
          <button type="button" onClick={() => addManualPoints(100)}>
            +100
          </button>
          <button type="button" className="reset-button" onClick={resetPoints} disabled={isLoading}>
            リセット
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
