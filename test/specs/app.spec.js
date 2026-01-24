describe("YT Point Application", () => {
  // Wait for Tauri to be fully initialized
  before(async () => {
    await browser.waitUntil(
      async () => {
        const ready = await browser.execute(() => {
          return typeof window.__TAURI__ !== "undefined" &&
                 typeof window.__TAURI__.core !== "undefined" &&
                 typeof window.__TAURI__.core.invoke === "function";
        });
        return ready;
      },
      { timeout: 10000, timeoutMsg: "Tauri did not initialize in time" }
    );
  });

  describe("Window Display", () => {
    it("should display the window with correct title", async () => {
      const title = await browser.getTitle();
      expect(title).toContain("YT Point");
    });

    it("should have the main heading", async () => {
      const heading = await $("h1");
      await expect(heading).toBeDisplayed();
      await expect(heading).toHaveText("YT Point");
    });

    it("should have the subtitle", async () => {
      const subtitle = await $(".subtitle");
      await expect(subtitle).toBeDisplayed();
      await expect(subtitle).toHaveText("YouTubeライブ配信ポイント集計");
    });
  });

  describe("Video URL Input", () => {
    it("should display the video URL input", async () => {
      const input = await $('input[type="text"]');
      await expect(input).toBeDisplayed();
    });

    it("should accept text input", async () => {
      const input = await $('input[type="text"]');
      await input.setValue("test-video-id");
      await expect(input).toHaveValue("test-video-id");
    });

    it("should have correct placeholder", async () => {
      const input = await $('input[type="text"]');
      const placeholder = await input.getAttribute("placeholder");
      expect(placeholder).toBe("YouTubeライブ配信URLまたはVideo ID");
    });
  });

  describe("Monitoring Controls", () => {
    it("should display the monitoring toggle switch", async () => {
      const toggle = await $(".monitoring-control button[role='switch']");
      await expect(toggle).toBeDisplayed();
    });

    it("should display the toggle label", async () => {
      const label = await $(".toggle-label");
      await expect(label).toBeDisplayed();
      await expect(label).toHaveText("接続");
    });

    it("should display the viewer window button", async () => {
      const viewerButton = await $("button=視聴者用ウィンドウを開く");
      await expect(viewerButton).toBeDisplayed();
    });
  });

  describe("Points Display", () => {
    it("should display initial total points as 0", async () => {
      const totalPoints = await $(".total-points");
      await expect(totalPoints).toBeDisplayed();
      await expect(totalPoints).toHaveText("0 pt");
    });

    it("should display all point categories", async () => {
      const categories = ["スーパーチャット", "同時接続者数", "高評価", "新規登録者", "手動追加"];

      for (const category of categories) {
        const label = await $(`span.label=${category}`);
        await expect(label).toBeDisplayed();
      }
    });
  });

  describe("Manual Point Buttons", () => {
    it("should display all manual point buttons", async () => {
      const amounts = ["+1", "+5", "+10", "+50", "+100"];

      for (const amount of amounts) {
        const button = await $(`button=${amount}`);
        await expect(button).toBeDisplayed();
      }
    });

    it("should update points when clicking +1 button", async () => {
      // Wait for element to be available
      const totalPoints = await $(".total-points");
      await totalPoints.waitForExist({ timeout: 5000 });

      // Get initial value
      const initialText = await totalPoints.getText();
      const initialValue = parseInt(initialText.replace(" pt", ""));

      // Click button
      const button = await $("button=+1");
      await button.click();

      // Wait a bit for the event to propagate
      await browser.pause(500);

      // Verify points increased
      await browser.waitUntil(
        async () => {
          const newText = await (await $(".total-points")).getText();
          const newValue = parseInt(newText.replace(" pt", ""));
          return newValue === initialValue + 1;
        },
        { timeout: 5000, interval: 200, timeoutMsg: "Points did not increase after clicking +1" }
      );
    });

    it("should update points when clicking +10 button", async () => {
      // Get initial value
      const totalPoints = await $(".total-points");
      const initialText = await totalPoints.getText();
      const initialValue = parseInt(initialText.replace(" pt", ""));

      // Click button
      const button = await $("button=+10");
      await button.click();

      // Wait a bit for the event to propagate
      await browser.pause(500);

      // Verify points increased
      await browser.waitUntil(
        async () => {
          const newText = await (await $(".total-points")).getText();
          const newValue = parseInt(newText.replace(" pt", ""));
          return newValue === initialValue + 10;
        },
        { timeout: 5000, interval: 200, timeoutMsg: `Points did not increase after clicking +10` }
      );
    });
  });

  describe("Layout", () => {
    it("should have three sections", async () => {
      const sections = await $$(".section");
      expect(sections.length).toBe(3);
    });

    it("should have section headers", async () => {
      const headers = ["配信設定", "現在のポイント", "手動ポイント追加"];

      for (const header of headers) {
        const h2 = await $(`h2=${header}`);
        await expect(h2).toBeDisplayed();
      }
    });
  });

  describe("Screenshots", () => {
    it("should capture full page screenshot", async () => {
      // Wait for page to fully render
      await browser.pause(500);

      await browser.saveScreenshot("./test/screenshots/full-page.png");
    });
  });

  describe("Viewer Window", () => {
    let mainWindow;

    it("should open viewer window when button is clicked", async () => {
      // Store main window handle
      mainWindow = await browser.getWindowHandle();

      // Find and click the viewer window button
      const buttons = await $$("button");
      let viewerButton;
      for (const btn of buttons) {
        const text = await btn.getText();
        if (text === "視聴者用ウィンドウを開く") {
          viewerButton = btn;
          break;
        }
      }

      await viewerButton.click();

      // Wait for new window to open
      await browser.pause(1000);

      // Get all window handles
      const handles = await browser.getWindowHandles();
      expect(handles.length).toBe(2);
    });

    it("should display viewer window with correct elements", async () => {
      // Switch to viewer window
      const handles = await browser.getWindowHandles();
      const viewerHandle = handles.find((h) => h !== mainWindow);
      await browser.switchToWindow(viewerHandle);

      // Wait for page to load
      await browser.pause(500);

      // Verify title
      const title = await browser.getTitle();
      expect(title).toBe("YT Point - Viewer");

      // Verify LIVE POINTS header
      const header = await $(".title");
      await expect(header).toBeDisplayed();
      await expect(header).toHaveText("LIVE POINTS");

      // Verify score display
      const score = await $(".score");
      await expect(score).toBeDisplayed();

      // Verify stats
      const statValues = await $$(".stat-value");
      expect(statValues.length).toBe(4);
      for (const stat of statValues) {
        await expect(stat).toBeDisplayed();
      }
    });

    it("should capture viewer window screenshot", async () => {
      // Ensure we're on viewer window
      const handles = await browser.getWindowHandles();
      const viewerHandle = handles.find((h) => h !== mainWindow);
      await browser.switchToWindow(viewerHandle);

      // Set window size to capture full content
      await browser.setWindowSize(500, 600);
      await browser.pause(500);
      await browser.saveScreenshot("./test/screenshots/viewer-window.png");
    });

    it("should switch back to main window", async () => {
      await browser.switchToWindow(mainWindow);
      const title = await browser.getTitle();
      expect(title).toContain("YT Point");
    });

    it("should sync points to viewer window when adding", async () => {
      // Add points on main window
      await browser.switchToWindow(mainWindow);
      const addButton = await $("button=+100");
      await addButton.click();
      await browser.pause(500);

      // Check viewer window
      const handles = await browser.getWindowHandles();
      const viewerHandle = handles.find((h) => h !== mainWindow);
      await browser.switchToWindow(viewerHandle);
      await browser.pause(500);

      const score = await $(".score");
      const scoreText = await score.getText();
      expect(parseInt(scoreText.replace(/,/g, ""))).toBeGreaterThan(0);
    });

    it("should sync reset to viewer window", async () => {
      // Switch to main window and reset
      await browser.switchToWindow(mainWindow);

      // Click reset button
      const resetButton = await $("button.reset-button");
      await resetButton.click();

      // Accept confirm dialog
      await browser.acceptAlert();

      // Wait for main window to show 0
      await browser.waitUntil(
        async () => {
          const mainTotal = await $(".total-points");
          const text = await mainTotal.getText();
          return text === "0 pt";
        },
        { timeout: 5000, timeoutMsg: "Main window did not reset to 0" }
      );

      // Check viewer window also shows 0
      const handles = await browser.getWindowHandles();
      const viewerHandle = handles.find((h) => h !== mainWindow);
      await browser.switchToWindow(viewerHandle);

      // Wait for viewer to update
      await browser.waitUntil(
        async () => {
          const score = await $(".score");
          const scoreText = await score.getText();
          return parseInt(scoreText.replace(/,/g, "")) === 0;
        },
        { timeout: 5000, timeoutMsg: "Viewer window did not reset to 0" }
      );
    });
  });
});
