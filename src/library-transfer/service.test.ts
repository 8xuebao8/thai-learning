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
