import { test, expect } from "@playwright/test";
test("known words skip before revealing, remain during navigation, and can be restored", async ({
  page,
}) => {
  await page.goto("/#/vocabulary");
  await page.getByRole("button", { name: "ประชุม pra²-chum¹ 开会" }).click();
  await expect(
    page.getByRole("button", { name: "我认识", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "我认识", exact: true }).click();
  await page.getByRole("button", { name: "完成并返回" }).click();
  await page.getByRole("link", { name: "学习首页", exact: true }).click();
  await page.getByRole("link", { name: "词汇学习", exact: true }).click();
  await page.getByLabel("词汇状态").selectOption("known");
  await expect(page.locator(".word-card")).toHaveCount(1);
  await page.getByRole("button", { name: "恢复学习", exact: true }).click();
  await expect(page.locator(".word-card")).toHaveCount(0);
  await page.getByLabel("词汇状态").selectOption("new");
  await expect(
    page.getByRole("button", { name: "ประชุม pra²-chum¹ 开会" }),
  ).toBeVisible();
});
test("raw Thai survives failed enrichment without entering learning quizzes", async ({
  page,
}) => {
  await page.route("**/functions/v1/generate-entry", (route) =>
    route.fulfill({ status: 503, body: '{"error":"unavailable"}' }),
  );
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "添加词语", exact: true })
    .first()
    .click();
  await page.getByLabel("泰文原文").fill("ทดสอบใหม่");
  await page.getByRole("button", { name: "自动收录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("原词已收录");
  await page.getByRole("button", { name: "关闭窗口" }).click();
  await page.getByRole("link", { name: "学习首页", exact: true }).click();
  await page.getByRole("link", { name: "词汇学习", exact: true }).click();
  await page.getByLabel("词汇状态").selectOption("pending");
  await expect(page.locator(".word-card")).toHaveCount(1);
  await expect(page.getByText("已收录 · 点击补全")).toBeVisible();
  await page.getByRole("button", { name: "学习卡片", exact: true }).click();
  await expect(page.locator(".study-overlay")).toHaveCount(0);
});
test("Thai-only enrichment saves a draft without manual confirmation", async ({
  page,
}) => {
  await page.route("**/functions/v1/generate-entry", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thai: "ทดสอบใหม่",
        roman: "thot²-sɔɔp² mai²",
        chinese: "重新测试",
        pos: "动词短语",
        note: "测试草稿",
        example: { thai: "", roman: "", chinese: "" },
      }),
    }),
  );
  await page.goto("/#/vocabulary");
  // CI may intentionally omit Supabase config; failure-path test above covers that build.
  await page
    .getByRole("button", { name: "添加词语", exact: true })
    .first()
    .click();
  await page.getByLabel("泰文原文").fill("ทดสอบใหม่");
  await page.getByRole("button", { name: "自动收录", exact: true }).click();
  await expect(
    page.getByRole("alert").or(page.getByText("重新测试", { exact: true })),
  ).toBeVisible();
  if (await page.getByText(/云服务尚未配置/).isVisible()) {
    test.skip(true, "Build has no cloud configuration");
    return;
  }
  await expect(page.getByText("重新测试", { exact: true })).toBeVisible();
  await expect(
    page.locator(".word-card").filter({ hasText: "重新测试" }),
  ).toContainText("待核对");
});
test("long term plan stores named grammar mastery and separate level self assessment", async ({
  page,
}) => {
  await page.goto("/#/progress");
  await page.getByLabel("目标等级").selectOption("Distinguished");
  await page.getByLabel("词汇总目标", { exact: true }).fill("12000");
  await page.getByLabel("语法总目标", { exact: true }).fill("300");
  await page.getByLabel("站外已认识词汇", { exact: true }).fill("2000");
  await page.getByLabel("新增语法点").fill("条件句");
  await page.getByRole("button", { name: "添加语法点" }).click();
  await page.getByLabel("条件句", { exact: true }).check();
  await page.getByRole("button", { name: "保存总目标" }).click();
  await expect(page.getByText("总目标已保存，可随时调整。")).toBeVisible();
  await page.getByRole("link", { name: "学习首页", exact: true }).click();
  await page.getByRole("link", { name: "学习进度", exact: true }).click();
  await expect(page.getByLabel("目标等级")).toHaveValue("Distinguished");
  await expect(page.getByText("词汇进度 2000 / 12000")).toBeVisible();
  await expect(page.getByText("语法进度 1 / 300")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("manual completion reuses a pending entry after generation fails", async ({
  page,
}) => {
  await page.route("**/functions/v1/generate-entry", (r) =>
    r.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "添加词语", exact: true })
    .first()
    .click();
  await page.getByLabel("泰文原文").fill("ทดสอบใหม่");
  await page.getByRole("button", { name: "自动收录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("原词已收录");
  await page.getByRole("button", { name: "手动填写", exact: true }).click();
  await page.getByLabel("罗马音", { exact: true }).fill("thot²-sɔɔp² mai²");
  await page.getByLabel("中文含义", { exact: true }).fill("重新测试");
  await page.getByRole("button", { name: "确认并保存" }).click();
  await page.getByPlaceholder("搜索泰文、罗马音或中文").fill("ทดสอบใหม่");
  await expect(page.locator(".word-card")).toHaveCount(1);
  await page.getByLabel("词汇状态").selectOption("pending");
  await expect(page.locator(".word-card")).toHaveCount(0);
});

test("retry difficult words never restores a word subsequently marked known", async ({
  page,
}) => {
  await page.goto("/#/vocabulary");
  await page.getByRole("button", { name: "学习卡片", exact: true }).click();
  await page.getByRole("button", { name: "揭示中文" }).click();
  await page.getByRole("button", { name: "需要多练", exact: true }).click();
  await page.getByRole("button", { name: "上一张", exact: true }).click();
  await page.getByRole("button", { name: "我认识", exact: true }).click();
  for (let i = 0; i < 17; i++)
    await page.getByRole("button", { name: "我认识", exact: true }).click();
  await expect(page.getByRole("button", { name: "完成并返回" })).toBeVisible();
  await expect(page.getByRole("button", { name: "再练难词" })).toHaveCount(0);
});

test("late enrichment cannot close a newer word editor", async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/functions/v1/generate-entry", async (route) => {
    requested = true;
    await delayed;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thai: "ทดสอบใหม่",
        roman: "test",
        chinese: "延迟测试",
        pos: "词语",
        note: "",
        example: { thai: "", roman: "", chinese: "" },
      }),
    });
  });
  await page.goto("/#/vocabulary");
  await page
    .getByRole("button", { name: "添加词语", exact: true })
    .first()
    .click();
  await page.getByLabel("泰文原文").fill("ทดสอบใหม่");
  await page.getByRole("button", { name: "自动收录", exact: true }).click();
  await expect
    .poll(
      async () =>
        requested || (await page.getByText(/云服务尚未配置/).isVisible()),
    )
    .toBe(true);
  if (!requested) {
    test.skip(true, "Build has no cloud configuration");
    return;
  }
  await page.getByRole("button", { name: "关闭窗口" }).click();
  await page
    .getByRole("button", { name: "添加词语", exact: true })
    .first()
    .click();
  await page.getByLabel("泰文原文").fill("ภาษาไทย");
  release();
  await expect(
    page.locator(".word-card").filter({ hasText: "延迟测试" }),
  ).toHaveCount(1);
  await expect(page.getByLabel("泰文原文")).toHaveValue("ภาษาไทย");
});
