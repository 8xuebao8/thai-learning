import { test, expect } from "@playwright/test";
test("custom themes create, rename, move and delete with preview and preserved words", async ({
  page,
}) => {
  await page.goto("/#/vocabulary");
  await page.getByRole("button", { name: "管理主题与移动词语" }).click();
  await page.getByLabel("主题名称", { exact: true }).fill("旅游");
  await page.getByRole("button", { name: "预览主题修改" }).click();
  const modal = page.getByRole("dialog", { name: "确认词库修改" });
  await expect(modal).toContainText("新增主题 1");
  await modal.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.locator(".tabs").getByRole("button", { name: "旅游", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "预览主题修改" }).click();
  await modal.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await page
    .getByRole("dialog", { name: "导入结果" })
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(
    page.locator(".tabs").getByRole("button", { name: "旅游", exact: true }),
  ).toBeVisible();
  await page.getByLabel("主题操作", { exact: true }).selectOption("move");
  await page
    .getByLabel("目标主题", { exact: true })
    .selectOption({ label: "旅游" });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "预览主题修改" }).click();
  await expect(modal).toContainText("移动词语 1");
  await modal.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await page
    .getByRole("dialog", { name: "导入结果" })
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: "旅游", exact: true })
    .click();
  await expect(page.locator(".word-card")).toHaveCount(1);
  await page
    .getByLabel("主题操作", { exact: true })
    .selectOption("theme_rename");
  await page
    .getByLabel("原主题", { exact: true })
    .selectOption({ label: "旅游" });
  await page.getByLabel("主题名称", { exact: true }).fill("出行");
  await page.getByRole("button", { name: "预览主题修改" }).click();
  await expect(modal).toContainText("旅游 → 出行");
  await modal.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await page
    .getByRole("dialog", { name: "导入结果" })
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await page
    .getByLabel("主题操作", { exact: true })
    .selectOption("theme_delete");
  await page.getByLabel("目标主题", { exact: true }).selectOption("personal");
  await page.getByRole("button", { name: "预览主题修改" }).click();
  await expect(modal).toContainText("迁移 1 个词条");
  await page.screenshot({
    path: `artifacts/themes-${test.info().project.name}.png`,
    fullPage: true,
  });
  await modal.getByRole("button", { name: "确认修改（临时体验）" }).click();
  await page
    .getByRole("dialog", { name: "导入结果" })
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(
    page.locator(".tabs").getByRole("button", { name: "出行", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".tabs")
    .getByRole("button", { name: "我的词库", exact: true })
    .click();
  await expect(page.locator(".word-card")).toHaveCount(1);
  await page.reload();
  await expect(
    page.locator(".tabs").getByRole("button", { name: "旅游", exact: true }),
  ).toHaveCount(0);
});

test("sentence theme rename, move and delete leave vocabulary untouched", async ({
  page,
}) => {
  await page.goto("/#/sentences");
  await page.evaluate(async () => {
    const { saveWord } = await import("/src/data/store.ts");
    await saveWord("guest", {
      id: "sentence-isolation",
      dirty: true,
      updatedAt: Date.now(),
      thai: "ฉันอ่าน",
      roman: "chan aan",
      chinese: "我阅读",
      theme: "work",
      pos: "句子",
      note: "主语动词",
      example: { thai: "ฉันอ่าน", roman: "chan aan", chinese: "我阅读" },
      source: "test",
      review: "draft",
      version: 0,
      sentence: {
        tokens: [
          { thai: "ฉัน", roman: "chan" },
          { thai: "อ่าน", roman: "aan" },
        ],
        alternatives: [],
        explanation: "主语动词",
      },
    });
  });
  await page.getByRole("button", { name: "管理句库主题与移动句子" }).click();
  const confirm = async () => {
    await page.getByRole("button", { name: "预览主题修改" }).click();
    await page
      .getByRole("dialog", { name: "确认句库修改" })
      .getByRole("button", { name: "确认修改（临时体验）" })
      .click();
    await page
      .getByRole("dialog", { name: "导入结果" })
      .getByRole("button", { name: "完成", exact: true })
      .click();
  };
  await page.getByLabel("主题名称", { exact: true }).fill("句子场景");
  await confirm();
  await page.getByLabel("主题操作", { exact: true }).selectOption("move");
  await page
    .getByLabel("目标主题", { exact: true })
    .selectOption({ label: "句子场景" });
  await page.getByRole("checkbox").first().check();
  await confirm();
  await page
    .getByLabel("主题操作", { exact: true })
    .selectOption("theme_rename");
  await page.getByLabel("原主题", { exact: true }).selectOption("work");
  await page.getByLabel("主题名称", { exact: true }).fill("句库工作");
  await confirm();
  await page
    .getByLabel("主题操作", { exact: true })
    .selectOption("theme_delete");
  await page.getByLabel("原主题", { exact: true }).selectOption("work");
  await page.getByLabel("目标主题", { exact: true }).selectOption("personal");
  await confirm();
  const data = await page.evaluate(async () => {
    const { loadData } = await import("/src/data/store.ts");
    return loadData("guest");
  });
  expect(data.settings.themes?.find((t) => t.id === "work")).toEqual({
    id: "work",
    name: "工作与商务",
  });
  expect(
    data.settings.sentenceThemes?.find((t) => t.id === "work"),
  ).toMatchObject({ name: "句库工作", redirectTo: "personal" });
  expect(data.words.find((w) => w.id === "sentence-isolation")?.theme).toBe(
    data.settings.sentenceThemes?.find((t) => t.name === "句子场景")?.id,
  );
  await page.getByRole("link", { name: "词汇学习", exact: true }).click();
  await expect(
    page
      .locator(".tabs")
      .getByRole("button", { name: "工作与商务", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".tabs")
      .getByRole("button", { name: "句子场景", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".word-card").filter({ hasText: "ฉันอ่าน" }),
  ).toHaveCount(0);
});
