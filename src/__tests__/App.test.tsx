import { act, fireEvent, render, screen } from "@testing-library/react";
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

import App from "../App";

describe("App", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockListen.mockClear();
    mockInvoke.mockResolvedValue(undefined);
    mockListen.mockResolvedValue(() => {});
  });

  describe("rendering", () => {
    it("renders the title", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("YT Point");
    });

    it("renders the subtitle", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByText("YouTubeライブ配信ポイント集計")).toBeInTheDocument();
    });

    it("renders video URL input", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID")).toBeInTheDocument();
    });

    it("renders initial total points as 0", async () => {
      let container: HTMLElement;
      await act(async () => {
        const result = render(<App />);
        container = result.container;
      });
      const totalPoints = container?.querySelector(".total-points");
      expect(totalPoints).toHaveTextContent("0 pt");
    });

    it("renders all point categories", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByText("スーパーチャット")).toBeInTheDocument();
      expect(screen.getByText("同時接続者数")).toBeInTheDocument();
      expect(screen.getByText("高評価")).toBeInTheDocument();
      expect(screen.getByText("新規登録者")).toBeInTheDocument();
      expect(screen.getByText("手動追加")).toBeInTheDocument();
    });

    it("renders manual point buttons", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByRole("button", { name: "+1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+5" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+10" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+50" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+100" })).toBeInTheDocument();
    });
  });

  describe("video URL input", () => {
    it("accepts input value", async () => {
      await act(async () => {
        render(<App />);
      });
      const input = screen.getByPlaceholderText(
        "YouTubeライブ配信URLまたはVideo ID",
      ) as HTMLInputElement;

      await act(async () => {
        fireEvent.change(input, { target: { value: "test-video-id" } });
      });

      expect(input.value).toBe("test-video-id");
    });

    it("is disabled when monitoring", async () => {
      await act(async () => {
        render(<App />);
      });
      const input = screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID");
      const toggle = screen.getByRole("switch");

      await act(async () => {
        fireEvent.change(input, { target: { value: "test-video-id" } });
      });

      await act(async () => {
        fireEvent.click(toggle);
      });

      await vi.waitFor(() => {
        expect(input).toBeDisabled();
      });
    });
  });

  describe("monitoring toggle", () => {
    it("shows toggle switch initially in off state", async () => {
      await act(async () => {
        render(<App />);
      });
      const toggle = screen.getByRole("switch");
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute("data-state", "unchecked");
      expect(screen.getByText("接続")).toBeInTheDocument();
    });

    it("adds shake class to input when clicking disabled switch", async () => {
      await act(async () => {
        render(<App />);
      });
      const input = screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID");
      const switchWrapper = screen.getByRole("switch").parentElement;

      // Input should not have shake class initially
      expect(input).not.toHaveClass("shake");

      // Click the switch wrapper while input is empty (switch is disabled)
      await act(async () => {
        fireEvent.click(switchWrapper!);
      });

      // Input should have shake class
      expect(input).toHaveClass("shake");
    });

    it("calls start_monitoring when toggle is switched on", async () => {
      await act(async () => {
        render(<App />);
      });
      const input = screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID");
      await act(async () => {
        fireEvent.change(input, { target: { value: "test-video-id" } });
      });

      const toggle = screen.getByRole("switch");
      await act(async () => {
        fireEvent.click(toggle);
      });

      expect(mockInvoke).toHaveBeenCalledWith("start_monitoring", {
        videoUrl: "test-video-id",
      });
    });

    it("calls stop_monitoring when toggle is switched off", async () => {
      await act(async () => {
        render(<App />);
      });
      const input = screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID");
      await act(async () => {
        fireEvent.change(input, { target: { value: "test-video-id" } });
      });

      const toggle = screen.getByRole("switch");

      // Turn on
      await act(async () => {
        fireEvent.click(toggle);
      });

      await vi.waitFor(() => {
        expect(toggle).toHaveAttribute("data-state", "checked");
      });

      // Turn off
      await act(async () => {
        fireEvent.click(toggle);
      });

      expect(mockInvoke).toHaveBeenCalledWith("stop_monitoring");
    });
  });

  describe("manual point buttons", () => {
    it("calls add_manual_points with correct amount for +1", async () => {
      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "+1" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 1,
      });
    });

    it("calls add_manual_points with correct amount for +5", async () => {
      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "+5" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 5,
      });
    });

    it("calls add_manual_points with correct amount for +10", async () => {
      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "+10" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 10,
      });
    });

    it("calls add_manual_points with correct amount for +50", async () => {
      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "+50" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 50,
      });
    });

    it("calls add_manual_points with correct amount for +100", async () => {
      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "+100" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 100,
      });
    });
  });

  describe("viewer window button", () => {
    it("renders viewer window button", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByRole("button", { name: /視聴者用ウィンドウ/ })).toBeInTheDocument();
    });

    it("calls open_viewer_window on click", async () => {
      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", {
        name: /視聴者用ウィンドウ/,
      });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockInvoke).toHaveBeenCalledWith("open_viewer_window");
    });
  });

  describe("reset button", () => {
    it("renders reset button", async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByRole("button", { name: "リセット" })).toBeInTheDocument();
    });

    it("calls reset_points when confirmed", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "リセット" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(confirmSpy).toHaveBeenCalledWith("ポイントをリセットしますか？");
      expect(mockInvoke).toHaveBeenCalledWith("reset_points");

      confirmSpy.mockRestore();
    });

    it("does not call reset_points when cancelled", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      await act(async () => {
        render(<App />);
      });
      const button = screen.getByRole("button", { name: "リセット" });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(confirmSpy).toHaveBeenCalledWith("ポイントをリセットしますか？");
      expect(mockInvoke).not.toHaveBeenCalledWith("reset_points");

      confirmSpy.mockRestore();
    });
  });
});
