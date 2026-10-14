import { test, expect } from "@playwright/test";
test("email login masks the password and reports a mocked credential error", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://*.supabase.co/auth/v1/token**", async (route) => {
    requests++;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: {
        "X-Supabase-Api-Version": "2024-01-01",
        "Access-Control-Allow-Origin": route.request().headers().origin,
        "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
      },
      body: JSON.stringify({
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "登录同步", exact: true }).click();
  const password = page.getByLabel("登录密码");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  const submit = page.getByRole("button", { name: "登录并同步", exact: true });
  if (await submit.isEnabled()) {
    await page.getByLabel("登录邮箱").fill("learner@example.com");
    await password.fill("test-only-password");
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText(
      "邮箱或密码不正确，请重新输入。",
    );
    expect(requests).toBe(1);
  } else {
    await expect(page.getByText(/尚未配置 Supabase/)).toBeVisible();
    expect(requests).toBe(0);
  }
});
test("learn a word, track temporary progress, add personal content and build a sentence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "让泰语，走进你的日常。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始学习", exact: true }).click();
  await expect(page.getByRole("button", { name: "揭示中文" })).toBeVisible();
  await page.getByRole("button", { name: "揭示中文" }).click();
  await page.getByRole("button", { name: "我认识", exact: true }).click();
  await page.getByRole("button", { name: "结束本次学习" }).click();
  await page.reload();
  await page.getByRole("link", { name: "学习进度" }).click();
  await expect(page.getByTestId("attempt-total")).toHaveText("0");
  await page
    .getByRole("button", { name: "添加词语", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "手动填写", exact: true }).click();
  await page.getByLabel("泰文原文").fill("ทดสอบ");
  await page.getByLabel("罗马音", { exact: true }).fill("thot⁴-sɔɔp²");
  await page.getByLabel("中文含义").fill("测试");
  await page.getByRole("button", { name: "确认并保存" }).click();
  await page.getByRole("link", { name: "词汇学习" }).click();
  await page.getByPlaceholder("搜索泰文、罗马音或中文").fill("测试");
  await expect(page.getByText("ทดสอบ", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "拼句练习" }).click();
  await page.getByRole("button", { name: "词块 เรา" }).click();
  await page.getByRole("button", { name: "词块 ประชุม" }).click();
  await page.getByRole("button", { name: "词块 วันนี้" }).click();
  await page.getByRole("button", { name: "检查答案" }).click();
  await expect(page.getByText("顺序正确，表达很清楚。")).toBeVisible();
  await expect(page.locator("body")).not.toHaveJSProperty("scrollWidth", 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("wrong answer feedback and target settings work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "拼句练习" }).click();
  await page.getByRole("button", { name: "词块 วันนี้" }).click();
  await page.getByRole("button", { name: "检查答案" }).click();
  await expect(page.getByText("再想一下词语之间的顺序。")).toBeVisible();
  await page.getByRole("button", { name: "重置" }).click();
  await page.getByRole("link", { name: "学习进度" }).click();
  await page.getByLabel("每日学习目标").fill("15");
  await page.getByLabel("每日学习目标").blur();
  await page.reload();
  await expect(page.getByLabel("每日学习目标")).toHaveValue("10");
});
test("Thai-first tiles can reveal assistance without nested buttons", async ({
  page,
}) => {
  await page.goto("/#/sentences");
  await page.getByLabel("文字显示模式").selectOption("thai");
  await expect(page.locator("button button")).toHaveCount(0);
  await page.getByRole("button", { name: "展开辅助文字" }).click();
  await expect(page.getByRole("button", { name: "词块 เรา" })).toContainText(
    "rao¹",
  );
});
test("guest refresh discards the card session", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习", exact: true }).click();
  await page.getByRole("button", { name: "揭示中文" }).click();
  await page.getByRole("button", { name: "我认识", exact: true }).click();
  await expect(page.locator(".flash-script")).toContainText("งาน");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /继续上次的词汇学习/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "开始学习", exact: true }).click();
  await expect(page.locator(".flash-script")).toContainText("ประชุม");
});
test("turns a manually confirmed personal sentence into a tile exercise", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加词语", exact: true }).click();
  await page.getByRole("button", { name: "手动填写", exact: true }).click();
  await page.getByLabel("泰文原文", { exact: true }).fill("ฉันมีงาน");
  await page.getByLabel("罗马音", { exact: true }).fill("chan⁵ mii¹ ngaan¹");
  await page.getByLabel("中文含义", { exact: true }).fill("我有工作要做。");
  await page.getByText("制作拼句练习（可选）", { exact: true }).click();
  await page.getByLabel("泰文词块").fill("ฉัน | มี | งาน");
  await page.getByLabel("词块罗马音").fill("chan⁵ | mii¹ | ngaan¹");
  await page.getByLabel("我已核对分词和正确顺序").check();
  await page.getByRole("button", { name: "确认并保存" }).click();
  await page.getByRole("link", { name: "拼句练习" }).click();
  await page.getByRole("button", { name: "我的句子", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我有工作要做。" }),
  ).toBeVisible();
  for (const w of ["ฉัน", "มี", "งาน"])
    await page.getByRole("button", { name: `词块 ${w}`, exact: true }).click();
  await page.getByRole("button", { name: "检查答案" }).click();
  await expect(page.getByText("顺序正确，表达很清楚。")).toBeVisible();
});
