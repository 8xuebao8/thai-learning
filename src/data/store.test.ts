import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { loadData, saveEvent, importBackup, db, saveWord } from "./store";
import type { Word } from "../domain/model";
it("persists events once across reload and refuses a broken import", async () => {
  await db.delete();
  await db.open();
  const e = {
    id: "one",
    itemId: "w",
    kind: "word" as const,
    at: 1000,
    result: "correct" as const,
    assisted: false,
    mode: "quiz",
    deviceId: "d",
  };
  await saveEvent("guest", e);
  await saveEvent("guest", e);
  expect((await loadData("guest")).events).toHaveLength(1);
  await expect(importBackup("guest", { version: 1 })).rejects.toThrow();
  expect((await loadData("guest")).events).toHaveLength(1);
  expect((await loadData("another")).events).toHaveLength(0);
});
it("keeps a pending deletion as a tombstone and isolates accounts", async () => {
  const w: Word = {
    id: "local",
    thai: "งาน",
    roman: "ngaan¹",
    chinese: "工作",
    theme: "personal",
    pos: "名词",
    note: "",
    example: { thai: "", roman: "", chinese: "" },
    source: "个人",
    review: "confirmed",
    version: 0,
    dirty: true,
    updatedAt: 1,
  };
  await saveWord("guest", w);
  await saveWord("guest", { ...w, deleted: true });
  expect(
    (await loadData("guest")).words.find((x) => x.id === "local")?.deleted,
  ).toBe(true);
  expect((await loadData("another")).words).toHaveLength(0);
});
