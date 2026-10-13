import { test, expect } from "@playwright/test";
test("Pages subpath caches lessons and discards guest learning after an offline reload", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "让泰语，走进你的日常。" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  const manifest = await page.evaluate(async () => {
    const href =
      document.querySelector<HTMLLinkElement>("link[rel=manifest]")!.href;
    return (await fetch(href)).json();
  });
  expect(manifest.start_url).toBe("/thai-learning/");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("离线", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "开始学习", exact: true }).click();
  await page.getByRole("button", { name: "揭示中文" }).click();
  await page.getByRole("button", { name: "我认识", exact: true }).click();
  await page.getByRole("button", { name: "结束本次学习" }).click();
  await page.getByRole("link", { name: "学习进度" }).click();
  await page.reload();
  await expect(page.getByTestId("attempt-total")).toHaveText("0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
