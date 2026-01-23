import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

describe("App", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(undefined);
  });

  describe("rendering", () => {
    it("renders the title", () => {
      render(<App />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("YT Point");
    });

    it("renders the subtitle", () => {
      render(<App />);
      expect(screen.getByText("YouTubeライブ配信ポイント集計")).toBeInTheDocument();
    });

    it("renders video URL input", () => {
      render(<App />);
      expect(screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID")).toBeInTheDocument();
    });

    it("renders initial total points as 0", () => {
      const { container } = render(<App />);
      const totalPoints = container.querySelector(".total-points");
      expect(totalPoints).toHaveTextContent("0 pt");
    });

    it("renders all point categories", () => {
      render(<App />);
      expect(screen.getByText("スーパーチャット")).toBeInTheDocument();
      expect(screen.getByText("同時接続者数")).toBeInTheDocument();
      expect(screen.getByText("高評価")).toBeInTheDocument();
      expect(screen.getByText("新規登録者")).toBeInTheDocument();
      expect(screen.getByText("手動追加")).toBeInTheDocument();
    });

    it("renders manual point buttons", () => {
      render(<App />);
      expect(screen.getByRole("button", { name: "+1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+5" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+10" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+50" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+100" })).toBeInTheDocument();
    });
  });

  describe("video URL input", () => {
    it("accepts input value", () => {
      render(<App />);
      const input = screen.getByPlaceholderText(
        "YouTubeライブ配信URLまたはVideo ID",
      ) as HTMLInputElement;

      fireEvent.change(input, { target: { value: "test-video-id" } });

      expect(input.value).toBe("test-video-id");
    });

    it("is disabled when monitoring", async () => {
      render(<App />);
      const input = screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID");
      const startButton = screen.getByRole("button", { name: "監視開始" });

      fireEvent.click(startButton);

      // Wait for state update
      await vi.waitFor(() => {
        expect(input).toBeDisabled();
      });
    });
  });

  describe("monitoring buttons", () => {
    it("shows start button initially", () => {
      render(<App />);
      expect(screen.getByRole("button", { name: "監視開始" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "監視停止" })).not.toBeInTheDocument();
    });

    it("calls start_monitoring on start button click", async () => {
      render(<App />);
      const input = screen.getByPlaceholderText("YouTubeライブ配信URLまたはVideo ID");
      fireEvent.change(input, { target: { value: "test-video-id" } });

      const startButton = screen.getByRole("button", { name: "監視開始" });
      fireEvent.click(startButton);

      expect(mockInvoke).toHaveBeenCalledWith("start_monitoring", {
        videoUrl: "test-video-id",
      });
    });

    it("shows stop button after starting monitoring", async () => {
      render(<App />);
      const startButton = screen.getByRole("button", { name: "監視開始" });
      fireEvent.click(startButton);

      await vi.waitFor(() => {
        expect(screen.getByRole("button", { name: "監視停止" })).toBeInTheDocument();
      });
    });

    it("calls stop_monitoring on stop button click", async () => {
      render(<App />);
      const startButton = screen.getByRole("button", { name: "監視開始" });
      fireEvent.click(startButton);

      await vi.waitFor(() => {
        expect(screen.getByRole("button", { name: "監視停止" })).toBeInTheDocument();
      });

      const stopButton = screen.getByRole("button", { name: "監視停止" });
      fireEvent.click(stopButton);

      expect(mockInvoke).toHaveBeenCalledWith("stop_monitoring");
    });
  });

  describe("manual point buttons", () => {
    it("calls add_manual_points with correct amount for +1", async () => {
      render(<App />);
      const button = screen.getByRole("button", { name: "+1" });
      fireEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 1,
      });
    });

    it("calls add_manual_points with correct amount for +5", async () => {
      render(<App />);
      const button = screen.getByRole("button", { name: "+5" });
      fireEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 5,
      });
    });

    it("calls add_manual_points with correct amount for +10", async () => {
      render(<App />);
      const button = screen.getByRole("button", { name: "+10" });
      fireEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 10,
      });
    });

    it("calls add_manual_points with correct amount for +50", async () => {
      render(<App />);
      const button = screen.getByRole("button", { name: "+50" });
      fireEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 50,
      });
    });

    it("calls add_manual_points with correct amount for +100", async () => {
      render(<App />);
      const button = screen.getByRole("button", { name: "+100" });
      fireEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("add_manual_points", {
        amount: 100,
      });
    });

    it("updates point display after adding manual points", async () => {
      const { container } = render(<App />);
      const button = screen.getByRole("button", { name: "+10" });
      fireEvent.click(button);

      await vi.waitFor(() => {
        const totalPoints = container.querySelector(".total-points");
        expect(totalPoints).toHaveTextContent("10 pt");
      });
    });
  });

  describe("viewer window button", () => {
    it("renders viewer window button", () => {
      render(<App />);
      expect(screen.getByRole("button", { name: "視聴者用ウィンドウを開く" })).toBeInTheDocument();
    });

    it("calls open_viewer_window on click", async () => {
      render(<App />);
      const button = screen.getByRole("button", {
        name: "視聴者用ウィンドウを開く",
      });
      fireEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("open_viewer_window");
    });
  });
});
