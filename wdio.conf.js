import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createConnection } from "node:net";
import { platform } from "node:os";
import { join } from "node:path";

// Build application before tests
const buildApp = () => {
  const result = spawnSync("bun", ["run", "tauri", "build", "--debug", "--no-bundle"], {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error("Failed to build Tauri app");
  }
};

// Get binary path based on platform
const getBinaryPath = () => {
  const ext = platform() === "win32" ? ".exe" : "";
  return join(import.meta.dirname, "src-tauri", "target", "debug", `yt-point${ext}`);
};

// Wait for port to be available
const waitForPort = (port, host, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const tryConnect = () => {
      const socket = createConnection({ port, host }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
    };
    tryConnect();
  });
};

let tauriDriver;

export const config = {
  specs: ["./test/specs/**/*.js"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: getBinaryPath(),
      },
    },
  ],
  services: [],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  hostname: "127.0.0.1",
  port: 4444,

  onPrepare: async function () {
    // Ensure screenshots directory exists
    const screenshotDir = join(import.meta.dirname, "test/screenshots");
    if (!existsSync(screenshotDir)) {
      mkdirSync(screenshotDir, { recursive: true });
    }

    // Build app
    buildApp();

    // Start tauri-driver
    const driverPath =
      platform() === "win32"
        ? join(process.env.USERPROFILE, ".cargo", "bin", "tauri-driver.exe")
        : join(process.env.HOME, ".cargo", "bin", "tauri-driver");

    // Find WebKitWebDriver path (set via WEBKIT_WEBDRIVER_PATH or find in PATH)
    let webkitDriverPath = process.env.WEBKIT_WEBDRIVER_PATH;
    if (!webkitDriverPath) {
      const result = spawnSync("which", ["WebKitWebDriver"], { encoding: "utf-8" });
      if (result.status === 0) {
        webkitDriverPath = result.stdout.trim();
      } else {
        throw new Error("WebKitWebDriver not found. Add webkitgtk to your PATH or set WEBKIT_WEBDRIVER_PATH");
      }
    }

    tauriDriver = spawn(driverPath, ["--native-driver", webkitDriverPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    tauriDriver.stdout.on("data", (data) => {
      console.log(`[tauri-driver] ${data}`);
    });

    tauriDriver.stderr.on("data", (data) => {
      console.error(`[tauri-driver] ${data}`);
    });

    // Wait for driver to be ready
    await waitForPort(4444, "127.0.0.1");
    console.log("[tauri-driver] Ready on port 4444");
  },

  onComplete: function () {
    if (tauriDriver) {
      tauriDriver.kill();
      console.log("[tauri-driver] Stopped");
    }
  },
};
