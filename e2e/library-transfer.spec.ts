import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test("AI import previews additions/deletions and cancel never changes the library", async ({
  page,
}) => {
  await page.goto("/#/vocabulary");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载词库 JSON", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^thai-vocabulary-ai-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.format).toBe("thai-learning-ai-context");
  expect(exported.library).toBe("words");
  expect(exported.snapshot.scope).toBe("words");
  expect(exported.snapshot.sentences).toBeUndefined();
  expect(exported.prompt).toContain("thai-library-changes");
  expect(exported.prompt).not.toContain(exported.snapshot.words[0].id);
  const snapshotId = exported.snapshot.snapshotId;
  const learning = exported.learningContext;
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
  // Obtain the real course ID from the downloaded data.
  pack.operations[1].id = exported.snapshot.words[0].id;
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

test("uploads all files and confirms a paginated large import once", async ({
  page,
}) => {
  await page.goto("/#/vocabulary");
  const snapshotId = await page.evaluate(async () => {
    const { copyLibrary } = await import("/src/library-transfer/service.ts");
    return (await copyLibrary("guest", "words")).snapshot.id;
  });
  const file = (offset: number, count: number) => ({
    name: `words-${offset}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "thai-library-changes",
        version: 1,
        snapshotId,
        operations: Array.from({ length: count }, (_, i) => ({
          action: "add",
          data: {
            thai: `ทดสอบไฟล์${offset + i}`,
            chinese: `测试${offset + i}`,
            roman: "test",
          },
        })),
      }),
    ),
  });
  await page.getByRole("button", { name: "导入 AI 修改", exact: true }).click();
  await page
    .getByLabel("上传全部 JSON 文件（可多选）")
    .setInputFiles([file(0, 110), file(110, 95)]);
  await expect(page.getByRole("status")).toContainText("已读取 2 个文件");
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认词库修改" });
  await expect(dialog).toContainText("新增 205");
  await expect(dialog.locator(".import-row")).toHaveCount(50);
  await dialog.getByRole("button", { name: "下一页" }).click();
  await expect(dialog).toContainText("第 2 / 5 页");
  await dialog.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await expect(page.getByRole("dialog", { name: "导入结果" })).toContainText(
    "已完成 205 项",
  );
  const count = await page.evaluate(async () => {
    const { loadData } = await import("/src/data/store.ts");
    return (await loadData("guest")).words.filter((w) =>
      w.thai.startsWith("ทดสอบไฟล์"),
    ).length;
  });
  expect(count).toBe(205);
});
