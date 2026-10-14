import { test, expect } from "@playwright/test";

test("manage all sentences, edit and delete personal entries, and start a chosen exercise", async ({
  page,
}) => {
  await page.goto("/#/sentences");
  await page.evaluate(async () => {
    const { saveWord } = await import("/src/data/store.ts");
    for (const [id, theme] of [
      ["manage-a", "personal"],
      ["manage-b", "life"],
    ]) {
      await saveWord("guest", {
        id,
        theme,
        thai: id === "manage-a" ? "ฉันอ่าน" : "ฉันเขียน",
        roman: "chan aan",
        chinese: id,
        pos: "句子",
        note: "",
        example: { thai: "", roman: "", chinese: "" },
        source: "test",
        review: "confirmed",
        version: 0,
        dirty: true,
        updatedAt: Date.now(),
        sentence: {
          tokens: [
            { thai: "ฉัน", roman: "chan" },
            { thai: id === "manage-a" ? "อ่าน" : "เขียน", roman: "aan" },
          ],
          alternatives: [],
          explanation: "主语动词",
        },
      });
    }
  });
  await page.getByRole("button", { name: /管理句库（11）/ }).click();
  await expect(page.locator(".sentence-library-card")).toHaveCount(11);
  await expect(page.getByText("内置示例 · 只读").first()).toBeVisible();
  await page.getByPlaceholder("搜索句子的泰文、罗马音或中文").fill("manage");
  await expect(page.locator(".sentence-library-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "编辑句子 ฉันอ่าน", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "编辑句子", exact: true });
  await editor.getByLabel("中文含义", { exact: true }).fill("我阅读");
  await editor.getByRole("button", { name: "确认并保存" }).click();
  await page.getByPlaceholder("搜索句子的泰文、罗马音或中文").fill("我阅读");
  await page.getByRole("button", { name: "练习这句", exact: true }).click();
  await expect(page.locator(".sentence-prompt")).toHaveText("我阅读");
  await page.getByRole("button", { name: /管理句库（11）/ }).click();
  await page
    .getByRole("button", { name: "编辑句子 ฉันอ่าน", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除句子", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /管理句库（10）/ }),
  ).toBeVisible();
  await page.getByPlaceholder("搜索句子的泰文、罗马音或中文").fill("");
  await expect(page.locator(".sentence-library-card")).toHaveCount(10);
});

test("add a sentence directly and require valid sentence blocks", async ({
  page,
}) => {
  await page.goto("/#/sentences");
  await page
    .getByRole("button", { name: "管理句库（9）", exact: true })
    .click();
  await page.getByRole("button", { name: "添加句子", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "添加句子", exact: true });
  await editor.getByLabel("泰文原文", { exact: true }).fill("ฉันอ่าน");
  await editor.getByLabel("罗马音", { exact: true }).fill("chan aan");
  await editor.getByLabel("中文含义", { exact: true }).fill("我阅读");
  await editor.getByRole("button", { name: "确认并保存" }).click();
  await expect(editor.getByRole("alert")).toContainText("请填写泰文词块");
  await editor.getByLabel("泰文词块", { exact: true }).fill("ฉัน | อ่าน");
  await editor.getByLabel("词块罗马音", { exact: true }).fill("chan | aan");
  await editor.getByLabel("我已核对分词和正确顺序").check();
  await editor.getByRole("button", { name: "确认并保存" }).click();
  await expect(
    page.getByRole("button", { name: "管理句库（10）", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { loadData } = await import("/src/data/store.ts");
    return (await loadData("guest")).words;
  });
  expect(saved).toHaveLength(1);
  expect(saved[0].sentence?.tokens).toHaveLength(2);
  await page.getByRole("link", { name: "词汇学习", exact: true }).click();
  await expect(
    page.locator(".word-card").filter({ hasText: "ฉันอ่าน" }),
  ).toHaveCount(0);
});
