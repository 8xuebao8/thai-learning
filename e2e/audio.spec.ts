import { test, expect, type Page } from "@playwright/test";

// Only the operating-system speech boundary is faked. The app and its controls are real.
async function speechEngine(
  page: Page,
  mode: "normal" | "silent" | "missing" | "short" = "normal",
) {
  await page.addInitScript(
    ({ mode }) => {
      class TestUtterance extends EventTarget {
        text: string;
        voice: SpeechSynthesisVoice | null = null;
        lang = "";
        rate = 1;
        pitch = 1;
        volume = 1;
        onstart = null;
        onend = null;
        onerror = null;
        constructor(text: string) {
          super();
          this.text = text;
        }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: TestUtterance,
      });
      const engine = new EventTarget();
      const voices =
        mode === "missing"
          ? []
          : ["Kanya", "Narisa"].map((name) => ({
              name,
              voiceURI: name,
              lang: "th-TH",
              localService: true,
              default: false,
            }));
      let current: SpeechSynthesisUtterance | undefined;
      const calls: { voice: string; rate: number; pitch: number }[] = [];
      Object.assign(window, { audioCalls: calls });
      Object.assign(engine, {
        getVoices: () => voices,
        paused: false,
        speaking: false,
        speak: (u: SpeechSynthesisUtterance) => {
          current = u;
          calls.push({
            voice: u.voice?.name ?? "",
            rate: u.rate,
            pitch: u.pitch,
          });
          if (mode !== "silent")
            setTimeout(() => {
              if (current === u) {
                u.onstart?.(new Event("start") as SpeechSynthesisEvent);
                if (mode === "short")
                  u.onend?.(new Event("end") as SpeechSynthesisEvent);
              }
            }, 100);
        },
        cancel: () => {
          const old = current;
          current = undefined;
          setTimeout(
            () =>
              old?.onerror?.({
                error: "interrupted",
              } as SpeechSynthesisErrorEvent),
            0,
          );
        },
        resume: () => {},
      });
      Object.defineProperty(window, "speechSynthesis", { value: engine });
    },
    { mode },
  );
}

test("voice choice stays in the website and playback uses the selected Thai voice at natural pitch", async ({
  page,
}) => {
  await speechEngine(page);
  await page.goto("/#/progress");
  await page.getByRole("button", { name: "朗读设置", exact: true }).click();
  await page
    .getByLabel("泰语声音")
    .selectOption({ label: "Narisa · 本地声音" });
  await page.getByRole("button", { name: "试听泰语" }).click();
  await expect(page.getByRole("button", { name: "停止朗读" })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { audioCalls: unknown[] }).audioCalls,
    ),
  ).toEqual([{ voice: "Narisa", rate: 1, pitch: 1 }]);
  await page.reload();
  await page.getByRole("button", { name: "朗读设置", exact: true }).click();
  await expect(page.getByLabel("泰语声音")).toHaveValue("Narisa");
});

test("switching words ignores stale cancellation and removing another card does not stop playback", async ({
  page,
}) => {
  await speechEngine(page);
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "播放泰语", exact: true })
    .nth(1)
    .click();
  await expect(page.getByRole("button", { name: "停止朗读" })).toHaveCount(1);
  await page
    .getByRole("button", { name: "播放泰语", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("搜索泰文、罗马音或中文").fill("ประชุม");
  await expect(page.getByRole("button", { name: "停止朗读" })).toHaveCount(1);
  await expect(page.getByText("播放失败，请稍后重试。")).toHaveCount(0);
  await page.getByRole("button", { name: "停止朗读" }).click();
  await expect(
    page.getByRole("button", { name: "播放泰语", exact: true }),
  ).toHaveCount(1);
});

test("silent engines time out instead of claiming to play forever", async ({
  page,
}) => {
  await speechEngine(page, "silent");
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "播放泰语", exact: true })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "取消加载" })).toBeVisible();
  await expect(page.getByText(/语音未能开始/)).toBeVisible({ timeout: 12000 });
  await expect(page.getByRole("button", { name: "取消加载" })).toHaveCount(0);
});

test("missing Thai voices produce a truthful web-only fallback", async ({
  page,
}) => {
  await speechEngine(page, "missing");
  await page.goto("/#/progress");
  await page.getByRole("button", { name: "朗读设置", exact: true }).click();
  await expect(page.getByText(/当前浏览器没有可用的泰语声音/)).toBeVisible();
  await expect(page.getByRole("button", { name: "试听泰语" })).toBeDisabled();
});

test("immediate silent completion reports a suspected voice failure", async ({
  page,
}) => {
  await speechEngine(page, "short");
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "播放泰语", exact: true })
    .first()
    .click();
  await expect(page.getByText(/语音过快结束/)).toBeVisible();
  await expect(page.getByRole("button", { name: "停止朗读" })).toHaveCount(0);
});
