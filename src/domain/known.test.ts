import { expect, it } from "vitest";
import { deriveProgress } from "./learning";
import type { LearningEvent } from "./model";
const event = (mode: string, at: number): LearningEvent => ({
  id: String(at),
  itemId: "word",
  kind: "word",
  at,
  result: "correct",
  assisted: false,
  mode,
  deviceId: "test",
});
it("known words never become due, even after later stale practice events", () => {
  const p = deriveProgress(
    [event("known", 1), event("quiz", 2)],
    "word",
    999999999,
  );
  expect(p.status).toBe("known");
  expect(p.due).toBe(false);
  expect(p.nextReview).toBeNull();
  expect(p.correct).toBe(0);
});
it("explicit restore returns a known word to new without inventing a correct answer", () => {
  const p = deriveProgress(
    [event("known", 1), event("restore", 2)],
    "word",
    999999999,
  );
  expect(p.status).toBe("new");
  expect(p.correct).toBe(0);
  expect(p.due).toBe(false);
});
