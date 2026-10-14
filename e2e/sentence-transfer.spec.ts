import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test("sentence library has independent download/import and rejects vocabulary cross-import", async ({
  page,
}) => {
  await page.goto("/#/sentences");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载句库 JSON", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^thai-sentences-ai-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.format).toBe("thai-learning-ai-context");
  expect(exported.library).toBe("sentences");
  expect(exported.snapshot.scope).toBe("sentences");
  expect(exported.snapshot.words).toBeUndefined();
  expect(exported.prompt).toContain("thai-sentence-changes");
  expect(exported.readOnly.sentences.length).toBeGreaterThan(0);
  expect(exported.readOnly.sentences.every((s: any) => s.readOnly)).toBe(true);
  const snapshot = exported.snapshot;
  expect(snapshot.sentences).toEqual([]);
  expect(exported.learningContext.words).toEqual([]);
  const pack = JSON.stringify({
    format: "thai-sentence-changes",
    version: 1,
    snapshotId: snapshot.snapshotId,
    operations: [
      {
        action: "add",
        data: {
          thai: "ฉันทดสอบ",
          roman: "chan thot-sop",
          chinese: "我来测试。",
          theme: "personal",
          pos: "句子",
          note: "主语＋动词。",
          example: {
            thai: "ฉันทดสอบ",
            roman: "chan thot-sop",
            chinese: "我来测试。",
          },
          sentence: {
            tokens: [
              { thai: "ฉัน", roman: "chan" },
              { thai: "ทดสอบ", roman: "thot-sop" },
            ],
            alternatives: [],
            explanation: "主语在动词前。",
          },
        },
      },
    ],
  });
  await page
    .getByRole("button", { name: "导入 AI 句库修改", exact: true })
    .click();
  await page.getByLabel("AI 修改包").fill(pack);
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认句库修改" });
  await expect(dialog).toContainText("新增 1");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  await dialog.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await expect(page.getByRole("dialog", { name: "导入结果" })).toContainText(
    "已完成 1 项",
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "我的句子", exact: true }).click();
  await expect(page.locator(".sentence-prompt")).toHaveText("我来测试。");
  await page.screenshot({
    path: `artifacts/sentence-library-${test.info().project.name}.png`,
    fullPage: true,
  });
  // Use in-app navigation to preserve the temporary guest account.
  await page.getByRole("link", { name: "词汇学习", exact: true }).click();
  const wordDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载词库 JSON", exact: true })
    .click();
  const wordDownload = await wordDownloadPromise;
  const wordExport = JSON.parse(
    await readFile((await wordDownload.path())!, "utf8"),
  );
  const words = wordExport.snapshot;
  expect(words.words.every((w: any) => !w.sentence)).toBe(true);
  await page.getByRole("button", { name: "导入 AI 修改", exact: true }).click();
  await page.getByLabel("AI 修改包").fill(pack);
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("入口");
});
