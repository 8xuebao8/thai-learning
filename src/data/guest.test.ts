import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { db, saveWord, saveEvent, loadData, clearAccount, setMeta, getMeta } from "./store";
import { courseWords } from "../content/course";
it("guest practice stays in memory, can navigate, and leaves no durable learning records", async () => {
  await clearAccount("guest");
  await saveWord("guest", { ...courseWords[0], id: "temporary" });
  await saveEvent("guest", { id:"practice", itemId:"temporary",kind:"word",at:1,result:"correct",assisted:false,mode:"known",deviceId:"demo" });
  await setMeta("guest:session", { index: 1 });
  expect((await loadData("guest")).words).toHaveLength(1);
  expect((await loadData("guest")).events).toHaveLength(1);
  expect(await getMeta("guest:session", null)).toEqual({index:1});
  expect(await db.words.where("account").equals("guest").count()).toBe(0);
  expect(await db.events.where("account").equals("guest").count()).toBe(0);
  expect(await db.meta.get("guest:session")).toBeUndefined();
  await clearAccount("guest");
  expect((await loadData("guest")).words).toHaveLength(0);
});
