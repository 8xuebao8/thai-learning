import { test, expect, type Page } from "@playwright/test";
async function mockAccount(page: Page) {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  let epoch = 0,
    seq = 0,
    resets = 0;
  let changes: any[] = [];
  await page.route("https://*.supabase.co/auth/v1/**", async (route) => {
    const token = route.request().url().includes("token");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        token
          ? {
              access_token: "test-session",
              token_type: "bearer",
              expires_in: 3600,
              refresh_token: "test-refresh",
              user,
            }
          : user,
      ),
    });
  });
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const body = route.request().postDataJSON();
    const response: any = {
      epoch,
      reset: false,
      acks: [],
      eventAcks: [],
      changes: [],
      conflicts: [],
      cursor: seq,
      more: false,
    };
    if (route.request().url().endsWith("reset_learning")) {
      resets++;
      epoch++;
      seq = 0;
      changes = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ epoch }),
      });
      return;
    }
    if (body.p_epoch !== epoch) response.reset = true;
    else {
      for (const r of body.p_records ?? []) {
        seq++;
        changes.push({
          seq,
          id: r.id,
          kind: r.kind,
          payload: r.payload,
          version: r.baseVersion + 1,
          deleted: !!r.deleted,
        });
        response.acks.push({ id: r.id, version: r.baseVersion + 1 });
      }
      for (const e of body.p_events ?? []) {
        seq++;
        changes.push({
          seq,
          id: e.id,
          kind: "event",
          payload: e,
          version: 1,
          deleted: false,
        });
        response.eventAcks.push(e.id);
      }
      response.changes = changes.filter((c) => c.seq > body.p_after);
      response.cursor = seq;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return {
    get resets() {
      return resets;
    },
    get changes() {
      return changes;
    },
  };
}
async function login(page: Page) {
  await page.getByRole("button", { name: "登录同步", exact: true }).click();
  const submit = page.getByRole("button", { name: "登录并同步", exact: true });
  if (!(await submit.isEnabled())) {
    test.skip(true, "Cloud build configuration absent");
    return;
  }
  await page.getByLabel("登录邮箱").fill("test@example.com");
  await page.getByLabel("登录密码").fill("test-only-password");
  await submit.click();
  await expect(
    page.getByRole("button", { name: "登录同步", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "我的总目标" })).toBeVisible();
}
test("guest data vanishes on refresh and never uploads on login", async ({
  page,
}) => {
  const backend = await mockAccount(page);
  await page.goto("/#/progress");
  await page.getByLabel("每日学习目标").fill("17");
  await page.getByLabel("每日学习目标").blur();
  await page.reload();
  await expect(page.getByLabel("每日学习目标")).toHaveValue("10");
  await page.getByLabel("每日学习目标").fill("19");
  await page.getByLabel("每日学习目标").blur();
  await login(page);
  await expect(page.getByLabel("每日学习目标")).toHaveValue("10");
  expect(backend.changes).toHaveLength(0);
  await page.getByLabel("每日学习目标").fill("23");
  await page.getByLabel("每日学习目标").blur();
  await expect
    .poll(() => backend.changes.some((c) => c.payload.goal === 23))
    .toBe(true);
  await page.reload();
  await expect(page.getByLabel("每日学习目标")).toHaveValue("23");
  await expect(
    page.getByRole("button", { name: "合并本机访客记录" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "立即同步" })).toHaveCount(0);
});
test("initialization requires both confirmations and leaves the account signed in", async ({
  page,
}) => {
  const backend = await mockAccount(page);
  await page.goto("/#/progress");
  await login(page);
  await page.getByLabel("每日学习目标").fill("23");
  await page.getByLabel("每日学习目标").blur();
  await expect.poll(() => backend.changes.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "一键初始化", exact: true }).click();
  expect(backend.resets).toBe(0);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(backend.resets).toBe(0);
  await page.getByRole("button", { name: "一键初始化", exact: true }).click();
  await page.getByRole("button", { name: "我了解，继续确认" }).click();
  await expect(
    page.getByRole("button", { name: "第二次确认并初始化" }),
  ).toBeDisabled();
  await page.getByLabel("初始化确认文字").fill("错误文字");
  await expect(
    page.getByRole("button", { name: "第二次确认并初始化" }),
  ).toBeDisabled();
  expect(backend.resets).toBe(0);
  await page.getByLabel("初始化确认文字").fill("确认初始化");
  await page.getByRole("button", { name: "第二次确认并初始化" }).click();
  await expect(page.getByLabel("每日学习目标")).toHaveValue("10");
  expect(backend.resets).toBe(1);
  await expect(
    page.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("每日学习目标")).toHaveValue("10");
  expect(backend.changes).toHaveLength(0);
});

test("cloud loading recovers automatically after a temporary failure", async ({
  page,
}) => {
  await mockAccount(page);
  let failures = true;
  await page.route("**/rest/v1/rpc/sync_learning_v2", async (route) => {
    if (failures) await route.fulfill({ status: 503, body: "{}" });
    else await route.fallback();
  });
  await page.goto("/#/progress");
  await page.getByRole("button", { name: "登录同步", exact: true }).click();
  await page.getByLabel("登录邮箱").fill("test@example.com");
  await page.getByLabel("登录密码").fill("test-only-password");
  const submit = page.getByRole("button", { name: "登录并同步", exact: true });
  if (!(await submit.isEnabled())) {
    test.skip(true, "Cloud build configuration absent");
    return;
  }
  await submit.click();
  await expect(
    page.getByRole("button", { name: "重新加载", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("云端数据加载失败，恢复网络后会自动重试。"),
  ).toBeVisible();
  failures = false;
  await expect(page.getByRole("heading", { name: "我的总目标" })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
});
