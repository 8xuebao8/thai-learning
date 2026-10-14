import { test, expect } from "@playwright/test";
test("sentence library has independent copy/import and rejects vocabulary cross-import", async ({
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
  await page.goto("/#/sentences");
  await page
    .getByRole("button", { name: "复制句库＋AI 提示词", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已复制句库" }),
  ).toBeVisible();
  const copied = await page.evaluate(() => (window as any).copied as string);
  const snapshot = JSON.parse(
    copied
      .split("个人句库快照（含已删除句供restore；不含登录信息）：\n")[1]
      .split("\n内置拼句（只读参考）：\n")[0],
  );
  expect(snapshot.sentences).toEqual([]);
  expect(JSON.parse(copied.split("学习上下文（只读）：\n")[1]).words).toEqual(
    [],
  );
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
  await page
    .getByRole("button", { name: "复制词库＋AI 提示词", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已复制词库" }),
  ).toBeVisible();
  const wordText = await page.evaluate(() => (window as any).copied as string);
  const words = JSON.parse(
    wordText
      .split("词库快照（含已删除词供restore；不含登录信息）：\n")[1]
      .split("\n\n学习上下文（只读）：\n")[0],
  );
  expect(words.words.every((w: any) => !w.sentence)).toBe(true);
  await page.getByRole("button", { name: "导入 AI 修改", exact: true }).click();
  await page.getByLabel("AI 修改包").fill(pack);
  await page.getByRole("button", { name: "预览修改", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("入口");
});
