import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { completePendingWord, db, saveWord } from "./store";
import { courseWords } from "../content/course";
it("late generation cannot overwrite a manually confirmed entry", async () => {
  const word = {
    ...courseWords[0],
    id: "pending-race",
    enrichment: "pending" as const,
    roman: "",
    chinese: "",
  };
  await saveWord("race", word);
  const pending = (await db.words.get(["race", word.id]))!;
  await saveWord("race", {
    ...pending,
    enrichment: "ready",
    roman: "mine",
    chinese: "我自己的意思",
    review: "confirmed",
  });
  expect(
    await completePendingWord("race", word.id, word.thai, pending.updatedAt, {
      ...courseWords[0],
      chinese: "模型的意思",
    }),
  ).toBe(false);
  expect((await db.words.get(["race", word.id]))?.chinese).toBe("我自己的意思");
});
it("generation completes the same pending record without dropping its sync version", async () => {
  const word = {
    ...courseWords[0],
    id: "pending-ok",
    version: 4,
    enrichment: "pending" as const,
    roman: "",
    chinese: "",
  };
  await saveWord("race", word);
  const pending = (await db.words.get(["race", word.id]))!;
  expect(
    await completePendingWord(
      "race",
      word.id,
      word.thai,
      pending.updatedAt,
      courseWords[0],
    ),
  ).toBe(true);
  const result = await db.words.get(["race", word.id]);
  expect(result?.version).toBe(4);
  expect(result?.enrichment).toBe("ready");
  expect(result?.review).toBe("draft");
});
