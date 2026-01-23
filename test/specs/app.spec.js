describe("YT Point Application", () => {
  describe("Window Display", () => {
    it("should display the window with correct title", async () => {
      const title = await browser.getTitle();
      expect(title).toBe("YT Point");
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

  describe("Monitoring Buttons", () => {
    it("should display the start monitoring button", async () => {
      const button = await $("button.primary");
      await expect(button).toBeDisplayed();
      await expect(button).toHaveText("監視開始");
    });

    it("should display the viewer window button", async () => {
      const buttons = await $$("button");
      const viewerButton = buttons.find(
        async (b) => (await b.getText()) === "視聴者用ウィンドウを開く"
      );
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
        const label = await $(`.point-item .label=${category}`);
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
      const button = await $("button=+1");
      const totalPoints = await $(".total-points");

      // Get initial value
      const initialText = await totalPoints.getText();
      const initialValue = parseInt(initialText.replace(" pt", ""));

      // Click button
      await button.click();

      // Verify points increased
      await browser.waitUntil(
        async () => {
          const newText = await totalPoints.getText();
          const newValue = parseInt(newText.replace(" pt", ""));
          return newValue === initialValue + 1;
        },
        { timeout: 5000, timeoutMsg: "Points did not increase after clicking +1" }
      );
    });

    it("should update points when clicking +10 button", async () => {
      const button = await $("button=+10");
      const totalPoints = await $(".total-points");

      const initialText = await totalPoints.getText();
      const initialValue = parseInt(initialText.replace(" pt", ""));

      await button.click();

      await browser.waitUntil(
        async () => {
          const newText = await totalPoints.getText();
          const newValue = parseInt(newText.replace(" pt", ""));
          return newValue === initialValue + 10;
        },
        { timeout: 5000, timeoutMsg: "Points did not increase after clicking +10" }
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
});
