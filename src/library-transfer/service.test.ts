import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.mock("../services/cloud", () => ({
  cloud: null,
  syncAccount: vi.fn(),
  withAccountLock: vi.fn(),
}));
import { clearAccount, loadData, saveEvent } from "../data/store";
import { copyLibrary, prepareImport, confirmImport } from "./service";
it("guest preview does not save; confirmed import is repeat-safe and stays temporary", async () => {
  await clearAccount("guest");
  const { snapshot } = await copyLibrary("guest");
  const text = JSON.stringify({
    format: "thai-library-changes",
    version: 1,
    snapshotId: snapshot.id,
    operations: [{ action: "add", data: { thai: "ทดสอบ" } }],
  });
  const p = await prepareImport("guest", text);
  expect((await loadData("guest")).words).toHaveLength(0);
  const r = await confirmImport("guest", p);
  expect(r.applied).toBe(1);
  expect((await loadData("guest")).words).toHaveLength(1);
  const again = await prepareImport("guest", text);
  expect(again.receipt?.applied).toBe(1);
  await clearAccount("guest");
  expect((await loadData("guest")).words).toHaveLength(0);
});
it("different packages from the same snapshot never overwrite prior additions", async () => {
  await clearAccount("guest");
  const { snapshot } = await copyLibrary("guest");
  const make = (thai: string) =>
    JSON.stringify({
      format: "thai-library-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations: [{ action: "add", data: { thai } }],
    });
  await confirmImport("guest", await prepareImport("guest", make("หนึ่ง")));
  await confirmImport("guest", await prepareImport("guest", make("สอง")));
  expect((await loadData("guest")).words.map((w) => w.thai).sort()).toEqual(
    ["สอง", "หนึ่ง"].sort(),
  );
});

it("copies learning context including known status and history without device identifiers", async () => {
  await clearAccount("guest");
  await saveEvent("guest", {
    id: "event-private",
    itemId: "course:meeting",
    kind: "word",
    at: 1000,
    result: "correct",
    assisted: false,
    mode: "known",
    deviceId: "private-device",
  });
  const { text } = await copyLibrary("guest");
  const context = JSON.parse(text.split("学习上下文（只读）：\n")[1]);
  expect(context.settings.goal).toBe(10);
  expect(
    context.words.find((w: { id: string }) => w.id === "course:meeting")
      .progress.status,
  ).toBe("known");
  expect(context.history).toHaveLength(1);
  expect(context.summary.practiceAttempts).toBe(0);
  expect(context.sentences.length).toBeGreaterThan(0);
  expect(text).not.toContain("private-device");
  expect(text).not.toContain("event-private");
});
it("confirms topic creation and movement atomically, keeping learning history", async () => {
  await clearAccount("guest");
  await saveEvent("guest", {
    id: "known",
    itemId: "course:meeting",
    kind: "word",
    at: 1,
    result: "correct",
    assisted: false,
    mode: "known",
    deviceId: "guest",
  });
  const { snapshot } = await copyLibrary("guest");
  const p = await prepareImport(
    "guest",
    JSON.stringify({
      format: "thai-library-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations: [
        { action: "theme_add", id: "custom:travel", name: "旅游" },
        {
          action: "move",
          id: "course:meeting",
          expectedVersion: 0,
          theme: "custom:travel",
        },
      ],
    }),
  );
  expect((await loadData("guest")).settings.themes).toBeUndefined();
  expect((await confirmImport("guest", p)).applied).toBe(2);
  const data = await loadData("guest");
  expect(
    data.settings.themes?.find((t) => t.id === "custom:travel")?.name,
  ).toBe("旅游");
  expect(data.words.find((w) => w.id === "course:meeting")?.theme).toBe(
    "custom:travel",
  );
  expect(data.events).toHaveLength(1);
  expect((await confirmImport("guest", p)).applied).toBe(2);
});
