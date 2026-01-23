import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

function App() {
  const [videoUrl, setVideoUrl] = useState("");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [points, setPoints] = useState({
    total: 0,
    superchat: 0,
    concurrent: 0,
    likes: 0,
    subscribers: 0,
    manual: 0,
  });

  const startMonitoring = async () => {
    try {
      await invoke("start_monitoring", { videoUrl });
      setIsMonitoring(true);
    } catch (e) {
      console.error("Failed to start monitoring:", e);
    }
  };

  const stopMonitoring = async () => {
    try {
      await invoke("stop_monitoring");
      setIsMonitoring(false);
    } catch (e) {
      console.error("Failed to stop monitoring:", e);
    }
  };

  const addManualPoints = async (amount: number) => {
    try {
      await invoke("add_manual_points", { amount });
      setPoints((prev) => ({
        ...prev,
        manual: prev.manual + amount,
        total: prev.total + amount,
      }));
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
      setPoints({
        total: 0,
        superchat: 0,
        concurrent: 0,
        likes: 0,
        subscribers: 0,
        manual: 0,
      });
    } catch (e) {
      console.error("Failed to reset points:", e);
    }
  };

  return (
    <div className="container">
      <h1>YT Point</h1>
      <p className="subtitle">YouTubeライブ配信ポイント集計</p>

      <div className="section">
        <h2>配信設定</h2>
        <div className="input-group">
          <input
            type="text"
            placeholder="YouTubeライブ配信URLまたはVideo ID"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            disabled={isMonitoring}
          />
        </div>
        <div className="button-group">
          {!isMonitoring ? (
            <button type="button" className="primary" onClick={startMonitoring}>
              監視開始
            </button>
          ) : (
            <button type="button" className="danger" onClick={stopMonitoring}>
              監視停止
            </button>
          )}
          <button type="button" onClick={openViewerWindow}>
            視聴者用ウィンドウを開く
          </button>
        </div>
      </div>

      <div className="section">
        <h2>現在のポイント</h2>
        <div className="points-display">
          <div className="total-points">{points.total} pt</div>
          <button type="button" className="reset-button" onClick={resetPoints}>
            リセット
          </button>
        </div>
        <div className="points-breakdown">
          <div className="point-item">
            <span className="label">スーパーチャット</span>
            <span className="value">{points.superchat} pt</span>
          </div>
          <div className="point-item">
            <span className="label">同時接続者数</span>
            <span className="value">{points.concurrent} pt</span>
          </div>
          <div className="point-item">
            <span className="label">高評価</span>
            <span className="value">{points.likes} pt</span>
          </div>
          <div className="point-item">
            <span className="label">新規登録者</span>
            <span className="value">{points.subscribers} pt</span>
          </div>
          <div className="point-item">
            <span className="label">手動追加</span>
            <span className="value">{points.manual} pt</span>
          </div>
        </div>
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
        </div>
      </div>
    </div>
  );
}

export default App;
