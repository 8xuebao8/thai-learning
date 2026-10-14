import { it, expect } from "vitest";
import { parsePackage } from "./contract";
const pack = (n: number, snapshotId = "s") => ({
  format: "thai-library-changes",
  version: 1,
  snapshotId,
  operations: Array.from({ length: n }, (_, i) => ({
    action: "add",
    data: { thai: `ทดสอบ${i}` },
  })),
});
it("accepts one large package and merges arrays, concatenated packages and code blocks", () => {
  expect(parsePackage(JSON.stringify(pack(1200))).operations).toHaveLength(
    1200,
  );
  for (const text of [
    JSON.stringify([pack(2), pack(3)]),
    JSON.stringify(pack(2)) + "\n" + JSON.stringify(pack(3)),
    "第一包\n```json\n" +
      JSON.stringify(pack(2)) +
      "\n```\n第二包\n```json\n" +
      JSON.stringify(pack(3)) +
      "\n```",
  ])
    expect(parsePackage(text).operations).toHaveLength(5);
});
it("rejects mixed snapshots, malformed trailing data and oversized operations", () => {
  expect(() =>
    parsePackage(JSON.stringify([pack(1), pack(1, "other")])),
  ).toThrow(/快照/);
  expect(() => parsePackage(JSON.stringify(pack(1)) + "{broken")).toThrow();
  expect(() => parsePackage(JSON.stringify(pack(10001)))).toThrow();
});

it("rejects mixed raw JSON and fences rather than silently discarding operations", () => {
  expect(() =>
    parsePackage(
      JSON.stringify(pack(1)) +
        "\n```json\n" +
        JSON.stringify(pack(2)) +
        "\n```",
    ),
  ).toThrow();
});
