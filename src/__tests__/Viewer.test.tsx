import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri API
const mockListen = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import Viewer from "../Viewer";

describe("Viewer", () => {
  beforeEach(() => {
    mockListen.mockClear();
    mockInvoke.mockClear();
    mockListen.mockResolvedValue(() => {});
    mockInvoke.mockResolvedValue({
      total: 0,
      superchat: 0,
      concurrent: 0,
      likes: 0,
      subscribers: 0,
      manual: 0,
      visitor: 0,
    });
  });

  describe("rendering", () => {
    it("renders the title", async () => {
      await act(async () => {
        render(<Viewer />);
      });
      expect(screen.getByText("合計")).toBeInTheDocument();
    });

    it("renders initial score as 0", async () => {
      const { container } = await act(async () => {
        return render(<Viewer />);
      });
      const score = container.querySelector(".score");
      expect(score).toHaveTextContent("0");
    });

    it("renders progress bar", async () => {
      await act(async () => {
        render(<Viewer />);
      });
      expect(screen.getByText("進捗")).toBeInTheDocument();
      expect(screen.getByText("0 / 5,000")).toBeInTheDocument();
    });

    it("renders all stat categories", async () => {
      await act(async () => {
        render(<Viewer />);
      });
      expect(screen.getByText("スーパーチャット")).toBeInTheDocument();
      expect(screen.getByText("同時視聴者数")).toBeInTheDocument();
      expect(screen.getByText("高評価数")).toBeInTheDocument();
      expect(screen.getByText("新規登録者数")).toBeInTheDocument();
      expect(screen.getByText("埼玉ボーナス")).toBeInTheDocument();
      expect(screen.getByText("ライバー訪問")).toBeInTheDocument();
    });
  });

  describe("initialization", () => {
    it("calls get_points on mount", async () => {
      await act(async () => {
        render(<Viewer />);
      });
      expect(mockInvoke).toHaveBeenCalledWith("get_points");
    });

    it("sets up event listener for points-update", async () => {
      await act(async () => {
        render(<Viewer />);
      });
      expect(mockListen).toHaveBeenCalledWith("points-update", expect.any(Function));
    });

    it("displays initial points from get_points", async () => {
      mockInvoke.mockResolvedValue({
        total: 500,
        superchat: 100,
        concurrent: 200,
        likes: 150,
        subscribers: 50,
        manual: 0,
        visitor: 0,
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(container.querySelector(".score")).toHaveTextContent("500");
    });
  });

  describe("points update via event", () => {
    it("updates stats when points-update event is received", async () => {
      let eventCallback: ((event: { payload: unknown }) => void) | null = null;
      mockListen.mockImplementation((eventName, callback) => {
        if (eventName === "points-update") {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      await act(async () => {
        render(<Viewer />);
      });

      expect(eventCallback).not.toBeNull();

      await act(async () => {
        eventCallback?.({
          payload: {
            points: {
              total: 100,
              superchat: 50,
              concurrent: 30,
              likes: 15,
              subscribers: 5,
              manual: 0,
              visitor: 0,
            },
            metrics: {
              superchat_amount: 5000,
              concurrent_viewers: 300,
              like_count: 150,
              initial_subscribers: 1000,
              current_subscribers: 1050,
            },
          },
        });
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      expect(screen.getByText("5,000")).toBeInTheDocument();
      expect(screen.getByText("300")).toBeInTheDocument();
    });
  });

  describe("point popup effect", () => {
    it("shows popup when points increase", async () => {
      let eventCallback: ((event: { payload: unknown }) => void) | null = null;
      mockListen.mockImplementation((eventName, callback) => {
        if (eventName === "points-update") {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        eventCallback?.({
          payload: {
            points: {
              total: 5,
              superchat: 0,
              concurrent: 0,
              likes: 0,
              subscribers: 0,
              manual: 5,
              visitor: 0,
            },
            metrics: {
              superchat_amount: 0,
              concurrent_viewers: 0,
              like_count: 0,
              initial_subscribers: 0,
              current_subscribers: 0,
            },
          },
        });
      });

      const popup = container.querySelector(".point-popup");
      expect(popup).toBeInTheDocument();
      expect(popup).toHaveTextContent("+5");
    });

    it("does not show popup when points decrease", async () => {
      mockInvoke.mockResolvedValue({
        total: 100,
        superchat: 0,
        concurrent: 0,
        likes: 0,
        subscribers: 0,
        manual: 100,
        visitor: 0,
      });

      let eventCallback: ((event: { payload: unknown }) => void) | null = null;
      mockListen.mockImplementation((eventName, callback) => {
        if (eventName === "points-update") {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await act(async () => {
        eventCallback?.({
          payload: {
            points: {
              total: 50,
              superchat: 0,
              concurrent: 0,
              likes: 0,
              subscribers: 0,
              manual: 50,
              visitor: 0,
            },
            metrics: {
              superchat_amount: 0,
              concurrent_viewers: 0,
              like_count: 0,
              initial_subscribers: 0,
              current_subscribers: 0,
            },
          },
        });
      });

      const popup = container.querySelector(".point-popup");
      expect(popup).not.toBeInTheDocument();
    });
  });

  describe("super effect", () => {
    it("shows super effect when points increase by 10 or more", async () => {
      let eventCallback: ((event: { payload: unknown }) => void) | null = null;
      mockListen.mockImplementation((eventName, callback) => {
        if (eventName === "points-update") {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        eventCallback?.({
          payload: {
            points: {
              total: 50,
              superchat: 50,
              concurrent: 0,
              likes: 0,
              subscribers: 0,
              manual: 0,
              visitor: 0,
            },
            metrics: {
              superchat_amount: 5000,
              concurrent_viewers: 0,
              like_count: 0,
              initial_subscribers: 0,
              current_subscribers: 0,
            },
          },
        });
      });

      const superEffect = container.querySelector(".superchat-effect");
      expect(superEffect).toBeInTheDocument();
    });

    it("does not show super effect when points increase by less than 10", async () => {
      let eventCallback: ((event: { payload: unknown }) => void) | null = null;
      mockListen.mockImplementation((eventName, callback) => {
        if (eventName === "points-update") {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        eventCallback?.({
          payload: {
            points: {
              total: 5,
              superchat: 0,
              concurrent: 0,
              likes: 0,
              subscribers: 0,
              manual: 5,
              visitor: 0,
            },
            metrics: {
              superchat_amount: 0,
              concurrent_viewers: 0,
              like_count: 0,
              initial_subscribers: 0,
              current_subscribers: 0,
            },
          },
        });
      });

      const superEffect = container.querySelector(".superchat-effect");
      expect(superEffect).not.toBeInTheDocument();
    });
  });

  describe("progress bar", () => {
    it("updates progress bar width based on points", async () => {
      mockInvoke.mockResolvedValue({
        total: 2500,
        superchat: 0,
        concurrent: 0,
        likes: 0,
        subscribers: 0,
        manual: 2500,
        visitor: 0,
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      const progressFill = container.querySelector(".progress-fill");
      expect(progressFill).toHaveStyle({ width: "50%" });
    });

    it("caps progress bar at 100%", async () => {
      mockInvoke.mockResolvedValue({
        total: 6000,
        superchat: 0,
        concurrent: 0,
        likes: 0,
        subscribers: 0,
        manual: 6000,
        visitor: 0,
      });

      const { container } = await act(async () => {
        return render(<Viewer />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      const progressFill = container.querySelector(".progress-fill");
      expect(progressFill).toHaveStyle({ width: "100%" });
    });
  });

  describe("cleanup", () => {
    it("unsubscribes from event listener on unmount", async () => {
      const unsubscribe = vi.fn();
      mockListen.mockResolvedValue(unsubscribe);

      const { unmount } = await act(async () => {
        return render(<Viewer />);
      });

      unmount();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
