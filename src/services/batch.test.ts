import { it, expect } from "vitest";
import { takeBatch } from "./batch";
it("splits long valid entries by byte size so they cannot block the queue", () => {
  const items = Array.from({ length: 100 }, (_, id) => ({
    id,
    note: "泰".repeat(2000),
    example: "语".repeat(2000),
  }));
  const first = takeBatch(items, 100, 180000);
  expect(first.length).toBeGreaterThan(0);
  expect(first.length).toBeLessThan(100);
  expect(
    new TextEncoder().encode(JSON.stringify(first)).length,
  ).toBeLessThanOrEqual(180000);
  const second = takeBatch(items.slice(first.length), 100, 180000);
  expect(second[0].id).toBe(first.length);
});
