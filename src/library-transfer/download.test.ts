import { expect, it } from "vitest";
import { wordSchema } from "../domain/model";
import { defaultCatalog } from "../domain/themes";
import type { Snapshot } from "./contract";
import { exportScopedPrompt } from "./scoped-export";
import { aiContextFilename, buildAiContext } from "./download";

const word = wordSchema.parse({
  id: "unique-word",
  thai: "คำ",
  chinese: "词",
  roman: "kham",
  theme: "personal",
  pos: "名词",
  note: "",
  example: { thai: "คำ", roman: "kham", chinese: "词" },
  source: "test",
  review: "draft",
  version: 0,
  dirty: true,
  updatedAt: 123,
});
const sentence = wordSchema.parse({
  ...word,
  id: "unique-sentence",
  sentence: {
    tokens: [
      { thai: "ก", roman: "a" },
      { thai: "ข", roman: "b" },
    ],
    alternatives: [],
    explanation: "词序",
  },
});
it.each(["words", "sentences"] as const)(
  "exports one structured %s snapshot without duplicated prompt data",
  (scope) => {
    const snapshot: Snapshot = {
      id: "snapshot-1",
      epoch: 1,
      scope,
      themes: defaultCatalog,
      words: [word, sentence],
    };
    const context = { readOnly: true, scope, words: [], sentences: [] };
    const text =
      exportScopedPrompt(snapshot) +
      "\n\n学习上下文（只读）：\n" +
      JSON.stringify(context);
    const output = buildAiContext(snapshot, text, scope);
    expect(output.library).toBe(scope);
    expect(output.snapshot.snapshotId).toBe(snapshot.id);
    expect(output.learningContext).toEqual(context);
    expect(output.prompt).not.toContain("unique-word");
    expect(output.prompt).not.toContain("unique-sentence");
    const entries =
      "words" in output.snapshot
        ? output.snapshot.words
        : output.snapshot.sentences;
    expect(entries.map((entry) => entry.id)).toEqual([
      scope === "words" ? word.id : sentence.id,
    ]);
    expect(entries[0]).not.toHaveProperty("dirty");
    expect(entries[0]).not.toHaveProperty("updatedAt");
    if (scope === "sentences")
      expect(output.readOnly!.sentences.every((entry) => entry.readOnly)).toBe(
        true,
      );
    else expect(output).not.toHaveProperty("readOnly");
  },
);
it("names the file using the Bangkok calendar date", () => {
  expect(aiContextFilename("words", new Date("2026-10-13T18:00:00Z"))).toBe(
    "thai-vocabulary-ai-2026-10-14.json",
  );
  expect(aiContextFilename("sentences", new Date("2026-10-13T16:59:00Z"))).toBe(
    "thai-sentences-ai-2026-10-13.json",
  );
});
