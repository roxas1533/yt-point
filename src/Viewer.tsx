import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import "./viewer.css";

interface PointState {
  total: number;
  superchat: number;
  concurrent: number;
  likes: number;
  subscribers: number;
  manual: number;
  visitor: number;
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

const TARGET_POINTS = 5000;

function Viewer() {
  const [points, setPoints] = useState<PointState>({
    total: 0,
    superchat: 0,
    concurrent: 0,
    likes: 0,
    subscribers: 0,
    manual: 0,
    visitor: 0,
  });
  const [metrics, setMetrics] = useState<RawMetrics>({
    superchat_amount: 0,
    concurrent_viewers: 0,
    like_count: 0,
    initial_subscribers: 0,
    current_subscribers: 0,
  });
  const [displayedScore, setDisplayedScore] = useState(0);
  const [popups, setPopups] = useState<{ id: number; amount: number; left: number }[]>([]);
  const [showSuperEffect, setShowSuperEffect] = useState(false);
  const pointsRef = useRef(points.total);

  // Keep ref in sync with state
  useEffect(() => {
    pointsRef.current = points.total;
  }, [points.total]);

  const showPointPopup = useCallback((amount: number) => {
    const id = Date.now();
    const left = 50 + (Math.random() - 0.5) * 30;
    setPopups((prev) => [...prev, { id, amount, left }]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== id));
    }, 1500);
  }, []);

  const triggerSuperEffect = useCallback(() => {
    setShowSuperEffect(true);
    setTimeout(() => setShowSuperEffect(false), 500);
  }, []);

  // Animate score
  useEffect(() => {
    if (displayedScore === points.total) return;

    const diff = points.total - displayedScore;
    const step = Math.ceil(Math.abs(diff) / 10) || 1;

    const timer = requestAnimationFrame(() => {
      if (displayedScore < points.total) {
        setDisplayedScore((prev) => Math.min(prev + step, points.total));
      } else {
        setDisplayedScore((prev) => Math.max(prev - step, points.total));
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [displayedScore, points.total]);

  // Handle points update - uses ref to avoid dependency on points.total
  const handlePointsUpdate = useCallback(
    (newPoints: PointState) => {
      const diff = newPoints.total - pointsRef.current;
      if (diff > 0) {
        showPointPopup(diff);
        if (diff >= 10) {
          triggerSuperEffect();
        }
      }
      setPoints(newPoints);
    },
    [showPointPopup, triggerSuperEffect],
  );

  // Fetch initial state and listen for updates
  useEffect(() => {
    invoke<PointState>("get_points").then((data) => {
      setPoints(data);
      setDisplayedScore(data.total);
    });

    const unlisten = listen<PointsUpdatePayload>("points-update", (event) => {
      handlePointsUpdate(event.payload.points);
      setMetrics(event.payload.metrics);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handlePointsUpdate]);

  const progress = Math.min((displayedScore / TARGET_POINTS) * 100, 100);

  return (
    <div className="viewer-container">
      <div className="header">
        <div className="title">合計</div>
      </div>

      <div className="score-section">
        <div className="score">{displayedScore.toLocaleString()}</div>
      </div>

      <div className="progress-section">
        <div className="progress-label">
          <span>進捗</span>
          <span>
            {displayedScore.toLocaleString()} / {TARGET_POINTS.toLocaleString()}
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}>
            <div className="progress-glow"></div>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat-item">
          <div className="stat-value">{metrics.superchat_amount.toLocaleString()}</div>
          <div className="stat-label">スーパーチャット</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{metrics.concurrent_viewers.toLocaleString()}</div>
          <div className="stat-label">同時視聴者数</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{metrics.like_count.toLocaleString()}</div>
          <div className="stat-label">高評価数</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">
            {(metrics.current_subscribers - metrics.initial_subscribers).toLocaleString()}
          </div>
          <div className="stat-label">新規登録者数</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{points.manual.toLocaleString()}</div>
          <div className="stat-label">埼玉ボーナス</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{points.visitor.toLocaleString()}</div>
          <div className="stat-label">ライバー訪問</div>
        </div>
      </div>

      {popups.map((popup) => (
        <div key={popup.id} className="point-popup" style={{ left: `${popup.left}%`, top: "40%" }}>
          +{popup.amount}
        </div>
      ))}

      {showSuperEffect && <div className="superchat-effect" />}
    </div>
  );
}

export default Viewer;
