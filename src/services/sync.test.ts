import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { db, saveWord, loadData } from "../data/store";
import { applyChanges } from "./sync";
import type { Word } from "../domain/model";
it("keeps an offline edit as a conflict copy when a remote revision arrives", async () => {
  const w: Word = {
    id: "shared",
    thai: "งาน",
    roman: "ngaan¹",
    chinese: "本机修改",
    theme: "personal",
    pos: "名词",
    note: "",
    example: { thai: "", roman: "", chinese: "" },
    source: "个人",
    review: "confirmed",
    version: 1,
    dirty: true,
    updatedAt: 1,
  };
  await saveWord("sync-test", w);
  await applyChanges(
    "sync-test",
    [
      {
        seq: 1,
        kind: "word",
        id: w.id,
        payload: { ...w, chinese: "云端修改" },
        version: 2,
        deleted: false,
      },
    ],
    1,
  );
  const data = await loadData("sync-test");
  expect(data.words.find((x) => x.id === "shared")?.chinese).toBe("云端修改");
  expect(
    data.words.some((x) => x.id !== "shared" && x.chinese === "本机修改"),
  ).toBe(true);
});
it("deduplicates downloaded events and advances cursor with the transaction", async () => {
  const payload = {
    id: "event-1",
    itemId: "word",
    kind: "word",
    at: 1000,
    result: "correct",
    assisted: false,
    mode: "quiz",
    deviceId: "d",
  };
  await applyChanges(
    "sync-events",
    [
      {
        seq: 1,
        kind: "event",
        id: "event-1",
        payload,
        version: 1,
        deleted: false,
      },
      {
        seq: 2,
        kind: "event",
        id: "event-1",
        payload,
        version: 1,
        deleted: false,
      },
    ],
    2,
  );
  expect((await loadData("sync-events")).events).toHaveLength(1);
  expect((await db.meta.get("sync-events:cursor"))?.value).toBe(2);
});
