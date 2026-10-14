import { test, expect } from "@playwright/test";
test("AI import previews additions/deletions and cancel never changes the library", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as any).copied = text;
        },
      },
    }),
  );
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "复制词库＋AI 提示词", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已复制" }),
  ).toBeVisible();
  const copied = await page.evaluate(() => (window as any).copied as string);
  const snapshotId = JSON.parse(
    copied
      .split("词库快照（含已删除词供restore；不含登录信息）：\n")[1]
      .split("\n\n学习上下文（只读）：\n")[0],
  ).snapshotId;
  const learning = JSON.parse(copied.split("学习上下文（只读）：\n")[1]);
  expect(learning.readOnly).toBe(true);
  expect(learning.words.length).toBeGreaterThan(0);
  expect(learning.settings.goal).toBe(10);
  const pack = {
    format: "thai-library-changes",
    version: 1,
    snapshotId,
    operations: [
      {
        action: "add",
        data: { thai: "ทดสอบนำเข้า", chinese: "导入测试", roman: "test" },
      },
      { action: "delete", id: "course:work:meeting", expectedVersion: 0 },
    ],
  };
  // Obtain real course ID from the copied data rather than assuming its format.
  pack.operations[1].id = JSON.parse(
    copied
      .split("词库快照（含已删除词供restore；不含登录信息）：\n")[1]
      .split("\n\n学习上下文（只读）：\n")[0],
  ).words[0].id;
  await page.getByRole("button", { name: "导入 AI 修改", exact: true }).click();
  const incomplete = structuredClone(pack);
  incomplete.operations[0].data!.roman = "";
  await page.getByLabel("AI 修改包").fill(JSON.stringify(incomplete));
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "确认词库修改" }),
  ).toContainText("不能进入学习测验");
  await page
    .getByRole("dialog", { name: "确认词库修改" })
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await page.getByLabel("AI 修改包").fill(JSON.stringify(pack));
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "确认词库修改" });
  await expect(modal).toContainText("新增 1");
  await expect(modal).toContainText("删除 1");
  await page.screenshot({
    path: `artifacts/ai-import-${test.info().project.name}.png`,
    fullPage: true,
  });
  await modal.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.locator(".word-card").filter({ hasText: "ทดสอบนำเข้า" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  await page.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await expect(page.getByRole("dialog", { name: "导入结果" })).toContainText(
    "已完成 2 项",
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(
    page.locator(".word-card").filter({ hasText: "ทดสอบนำเข้า" }),
  ).toHaveCount(1);
});
test("live sentence update removes stale selected tiles without crashing", async ({
  page,
}) => {
  await page.goto("/#/sentences");
  await expect(
    page.getByRole("button", { name: "我的句子", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const store = await import("/src/data/store.ts");
    await store.saveWord("guest", {
      id: "live-sentence",
      thai: "กขค",
      roman: "a b c",
      chinese: "测试句子",
      theme: "personal",
      pos: "句子",
      note: "",
      example: { thai: "", roman: "", chinese: "" },
      source: "test",
      review: "draft",
      enrichment: "ready",
      version: 0,
      dirty: false,
      updatedAt: 0,
      sentence: {
        tokens: [
          { thai: "ก", roman: "a" },
          { thai: "ข", roman: "b" },
          { thai: "ค", roman: "c" },
        ],
        alternatives: [],
        explanation: "说明",
      },
    });
  });
  await page.getByRole("button", { name: "我的句子", exact: true }).click();
  await page.getByRole("button", { name: "词块 ค", exact: true }).click();
  await page.evaluate(async () => {
    const store = await import("/src/data/store.ts");
    const w = await store.getWord("guest", "live-sentence");
    await store.saveWord("guest", {
      ...w!,
      thai: "กข",
      roman: "a b",
      sentence: {
        tokens: [
          { thai: "ก", roman: "a" },
          { thai: "ข", roman: "b" },
        ],
        alternatives: [],
        explanation: "新说明",
      },
    });
  });
  await expect(
    page.getByRole("button", { name: "词块 ข", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "退回词块 ค", exact: true }),
  ).toHaveCount(0);
});
