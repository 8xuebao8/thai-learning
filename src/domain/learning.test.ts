import { describe, it, expect } from "vitest";
import { deriveProgress, checkAnswer, mergeRecords } from "./learning";
import { backupSchema } from "./model";

describe("learning rules", () => {
  const event = (
    id: string,
    at: number,
    result = "correct",
    assisted = false,
  ) => ({
    id,
    itemId: "word",
    kind: "word" as const,
    at,
    result: result as "correct" | "wrong",
    assisted,
    mode: "quiz",
    deviceId: "device",
  });
  it("starts at learning and schedules a day without instant mastery", () => {
    const p = deriveProgress([event("a", 1000)], "word", 1000);
    expect(p.stage).toBe(0);
    expect(p.nextReview).toBe(86401000);
    expect(p.status).toBe("learning");
  });
  it("deduplicates events and does not advance from repeated early answers", () => {
    const a = event("a", 1000);
    const p = deriveProgress([a, a, event("b", 2000)], "word", 2000);
    expect(p.correct).toBe(2);
    expect(p.stage).toBe(0);
    expect(p.nextReview).toBe(86401000);
  });
  it("advances due answers and resets incorrect answers", () => {
    const p = deriveProgress(
      [event("a", 1000), event("b", 86401001)],
      "word",
      86401001,
    );
    expect(p.stage).toBe(1);
    expect(p.nextReview).toBe(345601001);
    expect(
      deriveProgress(
        [event("a", 1000), event("b", 86401001), event("c", 86401002, "wrong")],
        "word",
        86401002,
      ).stage,
    ).toBe(0);
  });
  it("assisted success never advances", () => {
    expect(
      deriveProgress(
        [event("a", 1000), event("b", 86401001, "correct", true)],
        "word",
        86401001,
      ).stage,
    ).toBe(0);
  });
  it("rejects duplicate tile instances but accepts interchangeable identical words", () => {
    const ex = {
      tiles: [
        { id: "a", token: "yes" },
        { id: "b", token: "yes" },
      ],
      answers: [["yes", "yes"]],
    };
    expect(checkAnswer(ex, ["a", "a"])).toBe(false);
    expect(checkAnswer(ex, ["b", "a"])).toBe(true);
    expect(checkAnswer(ex, ["missing", "a"])).toBe(false);
  });
  it("preserves conflicting edits and remote tombstones", () => {
    const local: {
      id: string;
      version: number;
      dirty: boolean;
      text: string;
      deleted?: boolean;
    }[] = [{ id: "a", version: 1, dirty: true, text: "local" }];
    const remote: {
      id: string;
      version: number;
      dirty: boolean;
      text: string;
      deleted?: boolean;
    }[] = [{ id: "a", version: 2, dirty: false, text: "remote" }];
    expect(mergeRecords(local, remote).conflicts).toHaveLength(1);
    expect(
      mergeRecords(local, [{ ...remote[0], deleted: true }]).records[0].deleted,
    ).toBe(true);
  });
  it("rejects corrupt backups rather than replacing data", () => {
    expect(
      backupSchema.safeParse({ version: 1, words: [{ thai: "hello" }] })
        .success,
    ).toBe(false);
  });
});
